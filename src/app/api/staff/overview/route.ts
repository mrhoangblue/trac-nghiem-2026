import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import { attentionList, buildProgress, type AttemptRecord } from "@/utils/teacherInsights";

export const runtime = "nodejs";

const MAX_EXAMS = 300;
const CLOSING_SOON_MS = 48 * 60 * 60 * 1000;
/** Đề không đặt giờ đóng: sau chừng này ngày mà chưa nộp thì coi là bỏ bài. */
const OPEN_EXAM_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const millisOf = (value: unknown): number | null => {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (typeof value === "string" && value) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Tổng quan cho bảng điều khiển của giáo viên: số liệu từng đề, việc cần làm và
 * học sinh cần chú ý. Giáo viên chỉ thấy đề mình là tác giả và lớp mình quản lý;
 * admin thấy mọi đề (lớp vẫn là lớp của chính mình).
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const now = Date.now();
    const examFields = ["title", "authorEmail", "endTime", "createdAt", "targetClassIds", "classIds"];
    const examQuery = authUser.role === "admin"
      ? adminDb.collection("exams").select(...examFields)
      : adminDb.collection("exams").where("authorEmail", "==", authUser.email).select(...examFields);
    const [examSnapshot, classSnapshot] = await Promise.all([
      examQuery.get(),
      adminDb.collection("classes").where("teacherId", "==", authUser.uid).get(),
    ]);
    const exams = examSnapshot.docs.slice(0, MAX_EXAMS).map((document) => {
      const data = document.data();
      const classIds = [...(Array.isArray(data.targetClassIds) ? data.targetClassIds : []), ...(Array.isArray(data.classIds) ? data.classIds : [])]
        .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
      return {
        id: document.id,
        title: String(data.title ?? "Bài thi"),
        endMillis: millisOf(data.endTime),
        createdMillis: millisOf(data.createdAt) ?? 0,
        classIds,
      };
    });
    const examTitles = new Map(exams.map((exam) => [exam.id, exam.title]));

    // ── Bài nộp của từng đề ──────────────────────────────────────────────────
    const perExam: Record<string, { submissions: number; students: number; pendingEssays: number; average: number | null }> = {};
    const attempts: AttemptRecord[] = [];
    const allStudents = new Set<string>();
    await Promise.all(exams.map(async (exam) => {
      const snapshot = await adminDb.collection("submissions").where("examId", "==", exam.id)
        .select("studentEmail", "studentName", "uid", "studentId", "scores", "gradingStatus", "submittedAt", "status", "isTeacherPreview")
        .get();
      const best = new Map<string, number>();
      let submissions = 0;
      let pendingEssays = 0;
      for (const document of snapshot.docs) {
        const data = document.data();
        if (data.isTeacherPreview === true) continue;
        if (typeof data.status === "string" && data.status !== "COMPLETED") continue;
        submissions++;
        const email = String(data.studentEmail ?? "").trim().toLowerCase();
        const studentId = typeof data.studentId === "string" && data.studentId ? data.studentId : typeof data.uid === "string" ? data.uid : null;
        const key = email || studentId || document.id;
        allStudents.add(key);
        if (data.gradingStatus === "pending") {
          pendingEssays++;
          if (!best.has(key)) best.set(key, Number.NaN);
          continue;
        }
        const total = Number((data.scores as { total?: unknown } | undefined)?.total);
        if (!Number.isFinite(total)) continue;
        const previous = best.get(key);
        if (previous === undefined || Number.isNaN(previous) || total > previous) best.set(key, total);
        attempts.push({ examId: exam.id, studentId, email, name: String(data.studentName ?? "Học sinh"), total, millis: millisOf(data.submittedAt) ?? 0 });
      }
      const scored = Array.from(best.values()).filter((value) => Number.isFinite(value));
      perExam[exam.id] = {
        submissions,
        students: best.size,
        pendingEssays,
        average: scored.length ? Math.round((scored.reduce((sum, value) => sum + value, 0) / scored.length) * 100) / 100 : null,
      };
    }));

    // ── Lớp của giáo viên: danh sách học sinh và yêu cầu chờ duyệt ───────────
    const classes = await Promise.all(classSnapshot.docs.map(async (document) => {
      const data = document.data();
      const ids: string[] = (Array.isArray(data.studentIds) ? data.studentIds : [])
        .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        .slice(0, 300);
      const [profiles, members] = await Promise.all([
        ids.length ? adminDb.getAll(...ids.map((value) => adminDb.collection("users").doc(value)), { fieldMask: ["fullName", "displayName", "email"] }) : Promise.resolve([]),
        adminDb.collection("class_members").where("classId", "==", document.id).get(),
      ]);
      return {
        id: document.id,
        name: typeof data.name === "string" ? data.name : "Lớp học",
        pending: members.docs.filter((member) => member.data().status === "pending").length,
        students: profiles.map((profile) => ({
          uid: profile.id,
          name: String(profile.data()?.fullName ?? profile.data()?.displayName ?? profile.data()?.email ?? "Học sinh"),
          email: String(profile.data()?.email ?? ""),
        })),
        // Chỉ tính "bỏ bài" với đề đã đóng, hoặc đề không hẹn giờ đã giao quá một tuần.
        examIds: exams
          .filter((exam) => exam.classIds.includes(document.id) && (exam.endMillis !== null ? exam.endMillis < now : exam.createdMillis < now - OPEN_EXAM_GRACE_MS))
          .map((exam) => exam.id),
      };
    }));

    const attention = attentionList(buildProgress(attempts, examTitles, classes)).slice(0, 12).map((item) => ({
      studentId: item.studentId,
      name: item.name,
      email: item.email,
      classNames: item.classNames,
      reasons: item.reasons,
      recentAverage: item.recentAverage,
      drop: item.drop,
      assigned: item.assigned,
      missed: item.missed,
      scores: item.scores.slice(-6).map((point) => ({ title: point.title, total: point.total })),
    }));

    return NextResponse.json({
      totals: {
        exams: exams.length,
        submissions: Object.values(perExam).reduce((sum, item) => sum + item.submissions, 0),
        students: allStudents.size,
        classes: classes.length,
        classStudents: new Set(classes.flatMap((item) => item.students.map((student) => student.uid))).size,
      },
      perExam,
      todo: {
        pendingEssays: exams.filter((exam) => (perExam[exam.id]?.pendingEssays ?? 0) > 0).map((exam) => ({ examId: exam.id, title: exam.title, count: perExam[exam.id].pendingEssays })),
        pendingMembers: classes.filter((item) => item.pending > 0).map((item) => ({ classId: item.id, name: item.name, count: item.pending })),
        closingSoon: exams
          .filter((exam) => exam.endMillis !== null && exam.endMillis > now && exam.endMillis - now <= CLOSING_SOON_MS)
          .sort((a, b) => (a.endMillis ?? 0) - (b.endMillis ?? 0))
          .map((exam) => ({ examId: exam.id, title: exam.title, endMillis: exam.endMillis, students: perExam[exam.id]?.students ?? 0 })),
      },
      attention,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/staff/overview failed:", error);
    return NextResponse.json({ error: "OVERVIEW_LOAD_FAILED" }, { status: 500 });
  }
}
