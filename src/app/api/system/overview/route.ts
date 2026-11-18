import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { millis, requireSystemAdmin, vnDay } from "@/lib/systemAdmin";

export const runtime = "nodejs";

const DAY = 86_400_000;
const DAYS = 30;

/** Tổng quan toàn hệ thống: quy mô, tăng trưởng 30 ngày, hoạt động và việc cần xử lý. */
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const now = Date.now();
    const [users, exams, submissions, classes] = await Promise.all([
      adminDb.collection("users").select("role", "createdAt", "disabled").get(),
      adminDb.collection("exams").select("authorEmail", "createdAt", "moderation").get(),
      adminDb.collection("submissions").select("submittedAt", "examId", "studentEmail", "status", "gradingStatus").get(),
      adminDb.collection("classes").select("teacherId").get(),
    ]);

    const days = Array.from({ length: DAYS }, (_, index) => vnDay(now - (DAYS - 1 - index) * DAY));
    const series = new Map(days.map((day) => [day, { day, users: 0, submissions: 0, exams: 0 }]));
    const bump = (ms: number | null, key: "users" | "submissions" | "exams") => {
      if (ms === null) return;
      const bucket = series.get(vnDay(ms));
      if (bucket) bucket[key] += 1;
    };

    const roles = { student: 0, mod: 0, pending_teacher: 0, admin: 0 };
    let disabled = 0;
    let usersLast7 = 0;
    let usersPrev7 = 0;
    users.docs.forEach((item) => {
      const role = String(item.get("role") ?? "student") as keyof typeof roles;
      if (role in roles) roles[role] += 1;
      if (item.get("disabled") === true) disabled += 1;
      const created = millis(item.get("createdAt"));
      bump(created, "users");
      if (created !== null && now - created < 7 * DAY) usersLast7 += 1;
      else if (created !== null && now - created < 14 * DAY) usersPrev7 += 1;
    });

    const authorByExam = new Map<string, string>();
    let hiddenExams = 0;
    exams.docs.forEach((item) => {
      authorByExam.set(item.id, String(item.get("authorEmail") ?? "").toLowerCase());
      if (item.get("moderation")?.hidden === true) hiddenExams += 1;
      bump(millis(item.get("createdAt")), "exams");
    });

    let submissionsLast7 = 0;
    let submissionsPrev7 = 0;
    let pendingGrading = 0;
    const activeStudents = new Set<string>();
    const activeTeachers = new Set<string>();
    submissions.docs.forEach((item) => {
      const submitted = millis(item.get("submittedAt"));
      bump(submitted, "submissions");
      if (item.get("gradingStatus") === "pending") pendingGrading += 1;
      if (submitted === null) return;
      if (now - submitted < 7 * DAY) submissionsLast7 += 1;
      else if (now - submitted < 14 * DAY) submissionsPrev7 += 1;
      if (now - submitted < 30 * DAY) {
        const student = String(item.get("studentEmail") ?? "").toLowerCase();
        if (student) activeStudents.add(student);
        const author = authorByExam.get(String(item.get("examId") ?? ""));
        if (author) activeTeachers.add(author);
      }
    });

    return NextResponse.json({
      totals: {
        users: users.size, students: roles.student, teachers: roles.mod, pendingTeachers: roles.pending_teacher, disabled,
        exams: exams.size, hiddenExams, submissions: submissions.size, classes: classes.size, pendingGrading,
      },
      activity: {
        activeStudents30: activeStudents.size,
        activeTeachers30: activeTeachers.size,
        usersLast7, usersPrev7, submissionsLast7, submissionsPrev7,
      },
      series: [...series.values()],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/system/overview failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
