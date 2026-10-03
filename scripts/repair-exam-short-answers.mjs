import { createDecipheriv, createHash } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, initializeFirestore } from "firebase-admin/firestore";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const apply = process.argv.includes("--apply");

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

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

function readBalanced(text, start, open, close) {
  if (text[start] !== open) return null;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === open && text[index - 1] !== "\\") depth += 1;
    if (text[index] === close && text[index - 1] !== "\\") {
      depth -= 1;
      if (depth === 0) return { content: text.slice(start + 1, index), end: index + 1 };
    }
  }
  return null;
}

function extractShortAnswers(source) {
  const answers = [];
  const commandPattern = /\\(?:shortans|dapso)\b/g;
  for (const match of source.matchAll(commandPattern)) {
    let position = match.index + match[0].length;
    while (/\s/.test(source[position] ?? "")) position += 1;
    if (source[position] === "[") {
      const optional = readBalanced(source, position, "[", "]");
      if (!optional) throw new Error(`Unbalanced optional argument after ${match[0]}`);
      position = optional.end;
    }
    while (/\s/.test(source[position] ?? "")) position += 1;
    const required = readBalanced(source, position, "{", "}");
    if (!required) throw new Error(`Missing answer argument after ${match[0]}`);
    answers.push(required.content.trim());
  }
  return answers;
}

function cleanStoredAnswer(value) {
  let answer = String(value ?? "").trim();
  if (answer.startsWith("$") && answer.endsWith("$") && answer.length >= 2) {
    answer = answer.slice(1, -1).trim();
  }
  if (answer.startsWith("\\(") && answer.endsWith("\\)")) {
    answer = answer.slice(2, -2).trim();
  }
  return answer.replace(/\{,\}/g, ",");
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\$/g, "")
    .replace(/[{}]/g, "")
    .replace(/−/g, "-")
    .replace(/,/g, ".");
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scoreSubmission(exam, questions, answersJson) {
  let parsed = {};
  try {
    parsed = asRecord(JSON.parse(answersJson ?? "{}"));
  } catch {
    parsed = {};
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

  const p1Total = finiteNumber(exam.scoringConfig?.part1TotalScore, 3);
  const p3Total = finiteNumber(exam.scoringConfig?.part3TotalScore, 3);
  const p2Table = [0, 0.1, 0.25, 0.5, 1];
  const round = (value) => Math.round(value * 100) / 100;
  const p1 = p1Questions.length ? p1Results.filter(Boolean).length * p1Total / p1Questions.length : 0;
  const p2 = p2Results.reduce((sum, matches) => sum + (p2Table[matches] ?? 0), 0);
  const p3 = p3Questions.length ? p3Results.filter(Boolean).length * p3Total / p3Questions.length : 0;

  return {
    part1Results: p1Results,
    part2Results: p2Results,
    part3Results: p3Results,
    scores: {
      p1: round(p1),
      p2: round(p2),
      p3: round(p3),
      total: round(p1 + p2 + p3),
      part1: { correct: p1Results.filter(Boolean).length, total: p1Questions.length, score: round(p1) },
      part2: {
        details: p2Results.map((matches, index) => ({
          match: matches,
          maxMatch: Array.isArray(p2Questions[index]?.correctAnswer) ? p2Questions[index].correctAnswer.length : 4,
          score: p2Table[matches] ?? 0,
        })),
        totalScore: round(p2),
      },
      part3: { correct: p3Results.filter(Boolean).length, total: p3Questions.length, score: round(p3) },
    },
  };
}

const examId = argument("exam-id");
if (!examId) throw new Error("Pass --exam-id=<Firestore document id>");

const app = getApps()[0] ?? initializeApp({
  credential: cert({
    projectId: requiredEnv("FIREBASE_PROJECT_ID"),
    clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: normalizePrivateKey(requiredEnv("FIREBASE_PRIVATE_KEY")),
  }),
});
const db = initializeFirestore(app, { preferRest: true });
const examRef = db.collection("exams").doc(examId);
const examSnapshot = await examRef.get();
if (!examSnapshot.exists) throw new Error(`Exam not found: ${examId}`);
const exam = examSnapshot.data();
if (!exam.rawLatexSource?.key) throw new Error("Exam has no encrypted LaTeX source reference");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  },
});
const response = await r2.send(new GetObjectCommand({
  Bucket: requiredEnv("R2_BUCKET_NAME"),
  Key: exam.rawLatexSource.key,
}));
const envelope = JSON.parse(await response.Body.transformToString("utf8"));
const decipher = createDecipheriv(
  "aes-256-gcm",
  createHash("sha256").update(normalizePrivateKey(requiredEnv("EXAM_SOURCE_ENCRYPTION_KEY"))).digest(),
  Buffer.from(envelope.iv, "base64"),
);
decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
const plaintext = Buffer.concat([
  decipher.update(Buffer.from(envelope.ciphertext, "base64")),
  decipher.final(),
]).toString("utf8");
const rawLatex = JSON.parse(plaintext);
const extractedAnswers = extractShortAnswers(String(rawLatex.part3 ?? "")).map(cleanStoredAnswer);
const questions = Array.isArray(exam.questions) ? exam.questions : [];
const shortQuestions = questions.filter((question) => question.type === "short_answer");
if (extractedAnswers.length !== shortQuestions.length || extractedAnswers.some((answer) => !answer)) {
  throw new Error(`Answer count mismatch: source=${extractedAnswers.length}, questions=${shortQuestions.length}`);
}

let shortIndex = 0;
const repairedQuestions = questions.map((question) => question.type === "short_answer"
  ? { ...question, correctAnswer: extractedAnswers[shortIndex++], requiresAnswerReview: false }
  : question
);
const submissions = await db.collection("submissions").where("examId", "==", examId).get();
const completed = submissions.docs.filter((document) => document.data().status === "COMPLETED");
const previews = completed.map((document) => {
  const before = document.data().scores ?? null;
  const result = scoreSubmission(exam, repairedQuestions, document.data().answersJson);
  return { id: document.id, studentEmail: document.data().studentEmail, before, after: result.scores };
});

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  examId,
  title: exam.title,
  extractedAnswers,
  completedSubmissions: completed.length,
  scoreChanges: previews,
}, null, 2));

if (!apply) process.exit(0);

const batch = db.batch();
batch.update(examRef, {
  questions: repairedQuestions,
  answersValidatedAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
for (const document of completed) {
  const result = scoreSubmission(exam, repairedQuestions, document.data().answersJson);
  batch.update(document.ref, {
    ...result,
    regradedAt: FieldValue.serverTimestamp(),
    regradeReason: "RESTORED_SHORT_ANSWERS_FROM_LATEX_SOURCE",
  });
}
await batch.commit();
console.log(JSON.stringify({ updatedExam: true, regradedSubmissions: completed.length }, null, 2));
