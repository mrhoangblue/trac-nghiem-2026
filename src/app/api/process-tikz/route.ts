import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/verifyAuth";
import { ParsedQuestion } from "@/utils/latexParser";
import { convertTikzToStoredImage, storeTikzDataUri } from "@/utils/tikzToImage";

export const runtime = "nodejs";

interface ProcessTikzRequest {
  questions?: ParsedQuestion[];
  timeoutMs?: number;
}

interface ProcessedQuestion extends ParsedQuestion {
  tikzImageUrl?: string;
  tikzImageKey?: string;
  explanationTikzImageUrl?: string;
  explanationTikzImageKey?: string;
  tikzConversionError?: string;
  explanationTikzConversionError?: string;
}

async function convertQuestionTikz(
  question: ParsedQuestion,
  timeoutMs?: number,
): Promise<{ question: ProcessedQuestion; convertedCount: number; failedCount: number }> {
  const processed: ProcessedQuestion = { ...question };
  let convertedCount = 0;
  let failedCount = 0;

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
    // Vai trò được phép xử lý TikZ: admin | mod (GV được duyệt có role 'mod').
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ProcessTikzRequest;
    const questions = body.questions;

    if (!Array.isArray(questions)) {
      return NextResponse.json(
        { error: "Missing or invalid questions array." },
        { status: 400 },
      );
    }

    const results = await Promise.all(
      questions.map((question) => convertQuestionTikz(question, body.timeoutMs)),
    );

    return NextResponse.json({
      questions: results.map((result) => result.question),
      convertedCount: results.reduce((sum, result) => sum + result.convertedCount, 0),
      failedCount: results.reduce((sum, result) => sum + result.failedCount, 0),
      failures: results.flatMap((result, index) => [
        ...(result.question.tikzConversionError
          ? [{ questionNumber: index + 1, field: "question", error: result.question.tikzConversionError }]
          : []),
        ...(result.question.explanationTikzConversionError
          ? [{ questionNumber: index + 1, field: "explanation", error: result.question.explanationTikzConversionError }]
          : []),
      ]),
      tikzProcessed: true,
    });
  } catch (error) {
    console.error("TikZ processing failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process TikZ content.",
      },
      { status: 502 },
    );
  }
}
