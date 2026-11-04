import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";

const MAX_EXAMS = 300;

/**
 * Số lượt làm của từng đề cho trang danh sách đề. Admin xem mọi đề; giáo viên chỉ
 * xem đề mình là tác giả (đề khác không có trong kết quả).
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const body = await request.json().catch(() => null) as { examIds?: unknown } | null;
    const examIds = Array.isArray(body?.examIds)
      ? Array.from(new Set(body.examIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128)))
      : [];
    if (examIds.length === 0 || examIds.length > MAX_EXAMS) {
      return NextResponse.json({ error: "INVALID_EXAM_IDS" }, { status: 400 });
    }

    let allowed = examIds;
    if (authUser.role !== "admin") {
      const exams = await adminDb.getAll(...examIds.map((id) => adminDb.collection("exams").doc(id)), { fieldMask: ["authorEmail"] });
      allowed = exams
        .filter((snapshot) => String(snapshot.data()?.authorEmail ?? "").toLowerCase() === authUser.email.toLowerCase())
        .map((snapshot) => snapshot.id);
    }

    const counts: Record<string, number> = {};
    await Promise.all(allowed.map(async (examId) => {
      const result = await adminDb.collection("submissions").where("examId", "==", examId).count().get();
      counts[examId] = result.data().count;
    }));
    return NextResponse.json({ counts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("POST /api/staff/exam-submission-counts failed:", error);
    return NextResponse.json({ error: "COUNTS_LOAD_FAILED" }, { status: 500 });
  }
}
