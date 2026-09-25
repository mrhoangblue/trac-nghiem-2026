import QuizPageClient from "@/components/QuizPageClient";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizPageClient examId={id} />;
}
