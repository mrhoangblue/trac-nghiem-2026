// Chỉ ĐỌC: chép phần câu hỏi của mọi đề trong Firestore ra một file JSON để
// rà hiển thị LaTeX (npm run audit:latex). Không ghi gì lên Firestore.
// Cách chạy: node --env-file=.env.local scripts/dump-exams-for-latex-audit.mjs <đường-dẫn.json>
import { writeFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const unquote = (value) => (value ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
const output = process.argv[2];
if (!output) {
  console.error("Thiếu đường dẫn file JSON đầu ra.");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: unquote(process.env.FIREBASE_PROJECT_ID),
    clientEmail: unquote(process.env.FIREBASE_CLIENT_EMAIL),
    privateKey: unquote(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n").replace(/\r/g, ""),
  }),
});

const snapshot = await getFirestore().collection("exams").get();
const exams = snapshot.docs.map((doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    title: String(data.title ?? ""),
    gradeLevel: data.gradeLevel ?? null,
    questions: Array.isArray(data.questions) ? data.questions : [],
  };
});
writeFileSync(output, JSON.stringify(exams));
console.log(`Đã chép ${exams.length} đề, ${exams.reduce((sum, exam) => sum + exam.questions.length, 0)} câu → ${output}`);
process.exit(0);
