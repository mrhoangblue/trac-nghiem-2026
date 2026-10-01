import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/verifyAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { ParsedQuestion } from "@/utils/latexParser";
import { hashExamPassword, validateExamPassword } from "@/lib/examAccess";
import {
  deleteExamSource,
  normalizeRawLatex,
  storeExamSource,
} from "@/lib/examSourceStorage";
import {
  convertTikzToStoredImage,
  processTikzToImagesWithStats,
  storeTikzDataUri,
} from "@/utils/tikzToImage";
import { mapWithConcurrency } from "@/utils/asyncPool";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_FIRESTORE_QUESTIONS_BYTES = 850 * 1024;

interface UploadQuizRequest {
  title?: string;
  description?: string;
  questions?: ParsedQuestion[];
  scoringConfig?: {
    part1TotalScore: number;
    part3TotalScore: number;
  };
  duration?: number;
  startTime?: string | null;
  endTime?: string | null;
  rawLatex?: {
    part1?: string;
    part2?: string;
    part3?: string;
  };
  authorEmail?: string;
  maxRetries?: number;
  isShared?: boolean;
  gradeLevel?: string;
  examType?: string | null;
  timeoutMs?: number;
  targetType?: "all" | "classes";
  targetClassIds?: string[];
  password?: string;
  importSourceObject?: {
    key?: string;
    url?: string | null;
  } | null;
  coverImageUrl?: string;
}

interface ProcessedQuestion extends ParsedQuestion {
  tikzConversionError?: string;
  explanationTikzConversionError?: string;
}

async function processContentField(
  value: string | undefined,
  timeoutMs: number | undefined,
): Promise<{ value: string | undefined; convertedCount: number; failedCount: number }> {
  if (!value) {
    return { value, convertedCount: 0, failedCount: 0 };
  }

  const result = await processTikzToImagesWithStats(value, { timeoutMs });
  return {
    value: result.content,
    convertedCount: result.convertedCount,
    failedCount: result.failedCount,
  };
}

async function processQuestionTikz(
  question: ParsedQuestion,
  timeoutMs: number | undefined,
): Promise<{ question: ProcessedQuestion; convertedCount: number; failedCount: number }> {
  const processed: ProcessedQuestion = { ...question };
  let convertedCount = 0;
  let failedCount = 0;

  const questionText = await processContentField(processed.questionText, timeoutMs);
  processed.questionText = questionText.value ?? "";
  convertedCount += questionText.convertedCount;
  failedCount += questionText.failedCount;

  const explanation = await processContentField(processed.explanation, timeoutMs);
  processed.explanation = explanation.value ?? "";
  convertedCount += explanation.convertedCount;
  failedCount += explanation.failedCount;

  if (processed.options) {
    const options = await Promise.all(
      processed.options.map((option) => processContentField(option, timeoutMs)),
    );
    processed.options = options.map((option) => option.value ?? "");
    convertedCount += options.reduce((sum, option) => sum + option.convertedCount, 0);
    failedCount += options.reduce((sum, option) => sum + option.failedCount, 0);
  }

  if (question.tikzCode) {
    try {
      const stored = await convertTikzToStoredImage(question.tikzCode, { timeoutMs });
      processed.tikzImageUrl = stored.url;
      processed.tikzImageKey = stored.key;
      delete processed.tikzCode;
      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      processed.tikzConversionError =
        error instanceof Error ? error.message : "Không thể chuyển hình TikZ.";
      console.error("Failed to convert question TikZ:", error);
    }
  } else if (question.tikzImageUrl?.startsWith("data:image/")) {
    try {
      const stored = await storeTikzDataUri(question.tikzImageUrl);
      processed.tikzImageUrl = stored.url;
      processed.tikzImageKey = stored.key;
      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      processed.tikzConversionError = error instanceof Error ? error.message : "Không thể lưu hình TikZ lên R2.";
    }
  }

  if (question.explanationTikzCode) {
    try {
      const stored = await convertTikzToStoredImage(
        question.explanationTikzCode,
        { timeoutMs },
      );
      processed.explanationTikzImageUrl = stored.url;
      processed.explanationTikzImageKey = stored.key;
      delete processed.explanationTikzCode;
      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      processed.explanationTikzConversionError =
        error instanceof Error ? error.message : "Không thể chuyển hình lời giải.";
      console.error("Failed to convert explanation TikZ:", error);
    }
  } else if (question.explanationTikzImageUrl?.startsWith("data:image/")) {
    try {
      const stored = await storeTikzDataUri(question.explanationTikzImageUrl);
      processed.explanationTikzImageUrl = stored.url;
      processed.explanationTikzImageKey = stored.key;
      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      processed.explanationTikzConversionError = error instanceof Error ? error.message : "Không thể lưu hình lời giải lên R2.";
    }
  }

  return { question: processed, convertedCount, failedCount };
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    // Vai trò được phép tạo đề: admin | mod (GV được duyệt có role 'mod').
    if (!authUser || (authUser.role !== "admin" && authUser.role !== "mod")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as UploadQuizRequest;

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Missing quiz title." }, { status: 400 });
    }
    const description = body.description?.trim() ?? "";
    if (description.length > 1000) {
      return NextResponse.json({ error: "DESCRIPTION_TOO_LONG" }, { status: 400 });
    }

    if (!Array.isArray(body.questions)) {
      return NextResponse.json(
        { error: "Missing or invalid questions array." },
        { status: 400 },
      );
    }
    if (body.questions.length === 0 || body.questions.length > 300) {
      return NextResponse.json({ error: "INVALID_QUESTION_COUNT" }, { status: 400 });
    }

    const results = await mapWithConcurrency(
      body.questions,
      2,
      (question) => processQuestionTikz(question, body.timeoutMs),
    );

    const questionsToSave = results.map((result) => result.question);
    if (Buffer.byteLength(JSON.stringify(questionsToSave), "utf8") > MAX_FIRESTORE_QUESTIONS_BYTES) {
      return NextResponse.json(
        { error: "EXAM_DOCUMENT_TOO_LARGE", message: "Nội dung câu hỏi vượt giới hạn an toàn của Firestore." },
        { status: 413 },
      );
    }
    const convertedCount = results.reduce((sum, result) => sum + result.convertedCount, 0);
    const failedCount = results.reduce((sum, result) => sum + result.failedCount, 0);
    if (failedCount > 0) {
      const failures = results.flatMap((result, index) => {
        const question = result.question;
        return [
          ...(question.tikzConversionError
            ? [{ questionNumber: index + 1, field: "question", error: question.tikzConversionError }]
            : []),
          ...(question.explanationTikzConversionError
            ? [{ questionNumber: index + 1, field: "explanation", error: question.explanationTikzConversionError }]
            : []),
        ];
      });
      return NextResponse.json({
        error: "TIKZ_CONVERSION_FAILED",
        message: `Có ${failedCount} hình TikZ chưa biên dịch được. Bài thi chưa được lưu để tránh mất hình.`,
        failedCount,
        failures,
      }, { status: 422 });
    }
    const p1Questions = questionsToSave.filter((q) => q.type === "multiple_choice");
    const p2Questions = questionsToSave.filter((q) => q.type === "true_false");
    const p3Questions = questionsToSave.filter((q) => q.type === "short_answer");

    const password = body.password ?? "";
    if (password) {
      const passwordError = validateExamPassword(password);
      if (passwordError) {
        return NextResponse.json({ error: passwordError }, { status: 400 });
      }
    }

    const docRef = adminDb.collection("exams").doc();
    const batch = adminDb.batch();
    const normalizedRawLatex = normalizeRawLatex(body.rawLatex);
    const importSourceObject = body.importSourceObject?.key?.startsWith("exam-imports/")
      ? {
          key: body.importSourceObject.key,
          url: typeof body.importSourceObject.url === "string" ? body.importSourceObject.url : null,
        }
      : null;
    let coverImageUrl = "";
    if (body.coverImageUrl?.trim()) {
      try {
        const parsedCoverUrl = new URL(body.coverImageUrl.trim());
        if (!['http:', 'https:'].includes(parsedCoverUrl.protocol)) throw new Error("INVALID_COVER_IMAGE_URL");
        coverImageUrl = parsedCoverUrl.toString();
      } catch {
        return NextResponse.json({ error: "INVALID_COVER_IMAGE_URL" }, { status: 400 });
      }
    }
    const rawLatexSource = normalizedRawLatex
      ? await storeExamSource({
          examId: docRef.id,
          rawLatex: normalizedRawLatex,
          uploadedBy: authUser.uid,
        })
      : null;
    batch.set(docRef, {
      title: body.title.trim(),
      description,
      questions: questionsToSave,
      questionCount: questionsToSave.length,
      part1Count: p1Questions.length,
      part2Count: p2Questions.length,
      part3Count: p3Questions.length,
      scoringConfig: {
        part1TotalScore: Number(body.scoringConfig?.part1TotalScore ?? 3),
        part3TotalScore: Number(body.scoringConfig?.part3TotalScore ?? 3),
      },
      duration: Number(body.duration ?? 90),
      startTime: body.startTime || null,
      endTime: body.endTime || null,
      rawLatexSource,
      tikzProcessed: failedCount === 0,
      tikzImageCount: convertedCount,
      tikzFailedCount: failedCount,
      authorEmail: authUser.email,
      maxRetries: Number(body.maxRetries ?? 1),
      isShared: Boolean(body.isShared),
      gradeLevel: body.gradeLevel ?? "",
      examType: body.examType ?? null,
      targetType: body.targetType ?? "all",
      targetClassIds: body.targetClassIds ?? [],
      requiresPassword: Boolean(password),
      importSourceObject,
      coverImageUrl,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (password) {
      batch.set(adminDb.collection("exam_secrets").doc(docRef.id), {
        ...hashExamPassword(password),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      await deleteExamSource(rawLatexSource).catch(() => undefined);
      throw error;
    }

    return NextResponse.json({
      id: docRef.id,
      convertedCount,
      failedCount,
      tikzProcessed: failedCount === 0,
    });
  } catch (error) {
    console.error("Upload quiz failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload quiz.",
      },
      { status: 500 },
    );
  }
}
