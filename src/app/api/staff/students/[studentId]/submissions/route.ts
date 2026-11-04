import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";

/**
 * Các lần làm bài của một học sinh. Admin thấy tất cả; giáo viên chỉ thấy bài của
 * những đề mình là tác giả hoặc đề giao cho lớp của mình.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const isAdmin = authUser.role === "admin";

    const { studentId } = await params;
    const studentSnapshot = await adminDb.collection("users").doc(studentId).get();
    const student = studentSnapshot.data();
    if (!student || (student.role ?? "student") !== "student") {
      return NextResponse.json({ error: "STUDENT_NOT_FOUND" }, { status: 404 });
    }
    const studentEmail = String(student.email ?? "").trim().toLowerCase();
    if (!studentEmail) return NextResponse.json({ error: "STUDENT_EMAIL_MISSING" }, { status: 400 });

    // Mã lớp của giáo viên này, dùng để nhận ra đề giao cho lớp mình.
    let ownClassIds = new Set<string>();
    if (!isAdmin) {
      const classes = await adminDb.collection("classes").where("teacherId", "==", authUser.uid).select().get();
      ownClassIds = new Set(classes.docs.map((item) => item.id));
    }

    const snapshot = await adminDb.collection("submissions").where("studentEmail", "==", student.email).get();
    const candidates = snapshot.docs
      .map((document) => ({ id: document.id, data: document.data() }))
      // Bỏ phiên đang làm dở; bài cũ không có status vẫn giữ.
      .filter(({ data }) => data.status !== "IN_PROGRESS" && typeof data.examId === "string" && data.examId);

    const examIds = Array.from(new Set(candidates.map(({ data }) => String(data.examId))));
    const examAccess = new Map<string, { allowed: boolean; title: string }>();
    for (let offset = 0; offset < examIds.length; offset += 30) {
      const chunk = examIds.slice(offset, offset + 30);
      const exams = await adminDb.getAll(...chunk.map((id) => adminDb.collection("exams").doc(id)));
      exams.forEach((examSnapshot) => {
        const exam = examSnapshot.data();
        if (!exam) return;
        const assigned = [
          ...(Array.isArray(exam.targetClassIds) ? exam.targetClassIds : []),
          ...(Array.isArray(exam.classIds) ? exam.classIds : []),
        ];
        const allowed = isAdmin
          || String(exam.authorEmail ?? "").toLowerCase() === authUser.email.toLowerCase()
          || assigned.some((id) => typeof id === "string" && ownClassIds.has(id));
        examAccess.set(examSnapshot.id, { allowed, title: String(exam.title ?? "") });
      });
    }

    const submissions = candidates
      .filter(({ data }) => examAccess.get(String(data.examId))?.allowed)
      .map(({ id, data }) => ({
        id,
        examId: String(data.examId),
        examTitle: String(data.examTitle ?? "") || examAccess.get(String(data.examId))?.title || "—",
        submittedAtMillis: (data.submittedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null,
        scores: data.scores && typeof data.scores === "object" ? data.scores : { total: 0, p1: 0, p2: 0, p3: 0 },
        essayPending: data.gradingStatus === "pending",
      }));

    return NextResponse.json({
      student: { name: String(student.fullName ?? ""), email: studentEmail },
      submissions,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/staff/students/[studentId]/submissions failed:", error);
    return NextResponse.json({ error: "STUDENT_SUBMISSIONS_LOAD_FAILED" }, { status: 500 });
  }
}
