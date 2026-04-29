import { NextResponse } from "next/server";
import { ParsedQuestion } from "@/utils/latexParser";
import { convertTikzToImage } from "@/utils/tikzToImage";

export const runtime = "nodejs";

interface ProcessTikzRequest {
  questions?: ParsedQuestion[];
  timeoutMs?: number;
}

interface ProcessedQuestion extends ParsedQuestion {
  tikzImageUrl?: string;
  explanationTikzImageUrl?: string;
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
      processed.tikzImageUrl = await convertTikzToImage(question.tikzCode, { timeoutMs });
      delete processed.tikzCode;
      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      processed.tikzConversionError =
        error instanceof Error ? error.message : "Không thể chuyển hình TikZ.";
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
    }
  }

  return { question: processed, convertedCount, failedCount };
}

export async function POST(request: Request) {
  try {
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
