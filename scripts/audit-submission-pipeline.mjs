import { cert, getApps, initializeApp } from "firebase-admin/app";
import { initializeFirestore } from "firebase-admin/firestore";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalizePrivateKey(value) {
  const unquoted = (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) ? value.slice(1, -1) : value;
  return unquoted.replace(/\\n/g, "\n").replace(/\r/g, "");
}

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\$/g, "")
    .replace(/[{}]/g, "")
    .replace(/−/g, "-")
    .replace(/,/g, ".");
}

function recalculate(exam, submission) {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  let parsed = {};
  try {
    parsed = asRecord(JSON.parse(submission.answersJson ?? "{}"));
  } catch {
    return { error: "INVALID_ANSWERS_JSON" };
  }
  const p1Ans = asRecord(parsed.p1Ans);
  const p2Ans = asRecord(parsed.p2Ans);
  const p3Ans = asRecord(parsed.p3Ans);
  const p1Questions = questions.filter((question) => question.type === "multiple_choice");
  const p2Questions = questions.filter((question) => question.type === "true_false");
  const p3Questions = questions.filter((question) => question.type === "short_answer");
  const p1Results = p1Questions.map((question) =>
    finiteNumber(p1Ans[String(question.id)], Number.NaN) === finiteNumber(question.correctAnswer, Number.NaN)
  );
  const p2Results = p2Questions.map((question) => {
    const correct = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
    const student = Array.isArray(p2Ans[String(question.id)]) ? p2Ans[String(question.id)] : [];
    return correct.filter((answer, index) => answer === student[index]).length;
  });
  const p3Results = p3Questions.map((question) => {
    const student = normalizeAnswer(p3Ans[String(question.id)]);
    return student.length > 0 && student === normalizeAnswer(question.correctAnswer);
  });
  const p2Table = [0, 0.1, 0.25, 0.5, 1];
  const p1Max = finiteNumber(exam.scoringConfig?.part1TotalScore, 3);
  const p3Max = finiteNumber(exam.scoringConfig?.part3TotalScore, 3);
  const round = (value) => Math.round(value * 100) / 100;
  const p1 = p1Questions.length ? p1Results.filter(Boolean).length * p1Max / p1Questions.length : 0;
  const p2 = p2Results.reduce((sum, matches) => sum + (p2Table[matches] ?? 0), 0);
  const p3 = p3Questions.length ? p3Results.filter(Boolean).length * p3Max / p3Questions.length : 0;
  return {
    p1: round(p1),
    p2: round(p2),
    p3: round(p3),
    total: round(p1 + p2 + p3),
  };
}

const app = getApps()[0] ?? initializeApp({
  credential: cert({
    projectId: requiredEnv("FIREBASE_PROJECT_ID"),
    clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: normalizePrivateKey(requiredEnv("FIREBASE_PRIVATE_KEY")),
  }),
});
const db = initializeFirestore(app, { preferRest: true });
const needle = argument("title", "kết thúc chương i").toLocaleLowerCase("vi");
const examSnapshot = await db.collection("exams").get();
const exams = examSnapshot.docs.filter((document) =>
  String(document.data().title ?? "").toLocaleLowerCase("vi").includes(needle)
);

for (const examDocument of exams) {
  const exam = examDocument.data();
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const submissionSnapshot = await db.collection("submissions").where("examId", "==", examDocument.id).get();
  const submissions = submissionSnapshot.docs.map((document) => {
    const data = document.data();
    const recalculated = data.status === "COMPLETED" || !data.status ? recalculate(exam, data) : null;
    return {
      id: document.id,
      studentName: data.studentName ?? null,
      studentEmail: data.studentEmail ?? null,
      status: data.status ?? "LEGACY_COMPLETED",
      isTeacherPreview: data.isTeacherPreview === true,
      submittedAt: data.submittedAt?.toDate?.()?.toISOString?.() ?? null,
      examStartTime: data.examStartTime?.toDate?.()?.toISOString?.() ?? null,
      hasAnswers: typeof data.answersJson === "string" && data.answersJson.length > 2,
      storedScores: data.scores ?? null,
      recalculated,
      scoreMatches: recalculated?.total === data.scores?.total,
    };
  });
  console.log(JSON.stringify({
    examId: examDocument.id,
    title: exam.title,
    authorEmail: exam.authorEmail ?? null,
    targetClassIds: exam.targetClassIds ?? exam.classIds ?? [],
    questionCount: questions.length,
    missingAnswers: questions.flatMap((question, index) => {
      if (question.type === "multiple_choice" && finiteNumber(question.correctAnswer, -1) < 0) return [index + 1];
      if (question.type === "short_answer" && !String(question.correctAnswer ?? "").trim()) return [index + 1];
      if (question.type === "true_false" && !Array.isArray(question.correctAnswer)) return [index + 1];
      return [];
    }),
    submissionCount: submissions.length,
    submissions,
  }, null, 2));
}

if (exams.length === 0) {
  console.error(`No exam title matched: ${needle}`);
  process.exitCode = 1;
}
