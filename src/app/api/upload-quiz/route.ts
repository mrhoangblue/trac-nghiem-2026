import { NextResponse } from "next/server";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ParsedQuestion } from "@/utils/latexParser";
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

export async function POST(request: Request) {
  try {
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

    const docRef = await addDoc(collection(db, "exams"), {
      title: body.title,
      description: body.description ?? "",
      questions: questionsToSave,
      questionCount: questionsToSave.length,
      part1Count: p1Questions.length,
      part2Count: p2Questions.length,
      part3Count: p3Questions.length,
      scoringConfig: {
        part1TotalScore: Number(body.scoringConfig?.part1TotalScore ?? 3),
        part3TotalScore: Number(body.scoringConfig?.part3TotalScore ?? 1),
      },
      duration: Number(body.duration ?? 90),
      startTime: body.startTime || null,
      endTime: body.endTime || null,
      rawLatex: body.rawLatex ?? null,
      tikzProcessed: true,
      tikzImageCount: convertedCount,
      tikzFailedCount: failedCount,
      authorEmail: body.authorEmail ?? "",
      maxRetries: Number(body.maxRetries ?? 1),
      isShared: Boolean(body.isShared),
      gradeLevel: body.gradeLevel ?? "",
      examType: body.examType ?? null,
      createdAt: serverTimestamp(),
    });

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
