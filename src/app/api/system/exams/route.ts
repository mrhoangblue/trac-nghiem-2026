import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { logAdminAction, millis, requireSystemAdmin } from "@/lib/systemAdmin";

export const runtime = "nodejs";

/** Toàn bộ đề trong hệ thống để kiểm duyệt. */
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const [exams, submissions] = await Promise.all([
      adminDb.collection("exams").select("title", "authorEmail", "gradeLevel", "examType", "targetType", "questionCount", "createdAt", "moderation", "requiresPassword").get(),
      adminDb.collection("submissions").select("examId").get(),
    ]);
    const attempts = new Map<string, number>();
    submissions.docs.forEach((item) => {
      const id = String(item.get("examId") ?? "");
      attempts.set(id, (attempts.get(id) ?? 0) + 1);
    });
    return NextResponse.json({
      exams: exams.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id, title: String(data.title ?? "Bài thi không có tên"), author: String(data.authorEmail ?? ""),
          gradeLevel: data.gradeLevel ?? null, examType: data.examType ?? null,
          classOnly: data.targetType === "classes", questionCount: Number(data.questionCount ?? 0),
          createdAtMillis: millis(data.createdAt), attempts: attempts.get(item.id) ?? 0,
          hidden: data.moderation?.hidden === true, hiddenReason: String(data.moderation?.reason ?? ""),
        };
      }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/system/exams failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

/** Ẩn hoặc hiện lại một đề: đề ẩn biến mất khỏi kho đề và học sinh không vào làm được. */
export async function PATCH(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({})) as { examId?: string; action?: "hide" | "unhide"; reason?: string };
  if (!body.examId || (body.action !== "hide" && body.action !== "unhide")) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const ref = adminDb.collection("exams").doc(body.examId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (body.action === "hide") {
      await ref.update({ moderation: { hidden: true, reason, by: auth.admin.email, at: FieldValue.serverTimestamp() } });
    } else {
      await ref.update({ moderation: FieldValue.delete() });
    }
    await logAdminAction(auth.admin, body.action === "hide" ? "exam.hide" : "exam.unhide", { type: "exam", id: body.examId, label: String(snapshot.get("title") ?? "") }, { reason });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/system/exams failed:", error);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }
}
