import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/verifyAuth";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { ParsedQuestion } from "@/utils/latexParser";
import { hashExamPassword, validateExamPassword } from "@/lib/examAccess";
import {
  convertTikzToImage,
  processTikzToImagesWithStats,
} from "@/utils/tikzToImage";

export const runtime = "nodejs";

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
      processed.tikzImageUrl = await convertTikzToImage(question.tikzCode, { timeoutMs });
      delete processed.tikzCode;
      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      processed.tikzConversionError =
        error instanceof Error ? error.message : "Không thể chuyển hình TikZ.";
      console.error("Failed to convert question TikZ:", error);
    }
  }

  if (question.explanationTikzCode) {
    try {
      processed.explanationTikzImageUrl = await convertTikzToImage(
        question.explanationTikzCode,
        { timeoutMs },
      );
      delete processed.explanationTikzCode;
      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      processed.explanationTikzConversionError =
        error instanceof Error ? error.message : "Không thể chuyển hình lời giải.";
      console.error("Failed to convert explanation TikZ:", error);
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

    if (!Array.isArray(body.questions)) {
      return NextResponse.json(
        { error: "Missing or invalid questions array." },
        { status: 400 },
      );
    }

    const results = await Promise.all(
      body.questions.map((question) => processQuestionTikz(question, body.timeoutMs)),
    );

    const questionsToSave = results.map((result) => result.question);
    const convertedCount = results.reduce((sum, result) => sum + result.convertedCount, 0);
    const failedCount = results.reduce((sum, result) => sum + result.failedCount, 0);
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
    batch.set(docRef, {
      title: body.title,
      description: body.description ?? "",
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
      rawLatex: body.rawLatex ?? null,
      tikzProcessed: true,
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
    await batch.commit();

    return NextResponse.json({
      id: docRef.id,
      convertedCount,
      failedCount,
      tikzProcessed: true,
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
