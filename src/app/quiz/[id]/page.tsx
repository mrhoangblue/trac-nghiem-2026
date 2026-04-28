import { notFound } from "next/navigation";
import QuizClient from "@/components/QuizClient";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";
import { ScoringConfig, TimingConfig } from "@/utils/examTypes";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const docSnap = await getDoc(doc(db, "exams", id));
  if (!docSnap.exists()) notFound();

  const data = docSnap.data();

  const scoringConfig: ScoringConfig = data.scoringConfig ?? {
    part1TotalScore: 3,
    part3TotalScore: 1,
  };

  const timing: TimingConfig = {
    duration: data.duration ?? 90,
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
  };

  // Re-parse from rawLatex khi có — áp dụng mọi fix mới nhất của parser.
  let questions: ParsedQuestion[];
  if (data.rawLatex) {
    const { part1 = "", part2 = "", part3 = "" } = data.rawLatex;
    questions = [
      ...parseLatexExam(part1),
      ...parseLatexExam(part2),
      ...parseLatexExam(part3),
    ].map((q, idx) => ({ ...q, id: idx + 1 }));
  } else {
    questions = (data.questions ?? []) as ParsedQuestion[];
  }

  return (
    <QuizClient
      examId={id}
      title={data.title ?? "Bài thi"}
      questions={questions}
      scoringConfig={scoringConfig}
      timing={timing}
      maxRetries={data.maxRetries ?? 1}
    />
  );
}
