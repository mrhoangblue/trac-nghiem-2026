import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { logAdminAction, millis, requireSystemAdmin, systemAdminEmails } from "@/lib/systemAdmin";

export const runtime = "nodejs";

const ROLES = ["student", "mod", "pending_teacher"] as const;
type Role = (typeof ROLES)[number];

/** Danh sách người dùng kèm số bài nộp (học sinh) hoặc số đề và lượt làm (giáo viên). */
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const [users, exams, submissions] = await Promise.all([
      adminDb.collection("users").get(),
      adminDb.collection("exams").select("authorEmail").get(),
      adminDb.collection("submissions").select("studentEmail", "examId", "submittedAt").get(),
    ]);
    const adminEmails = new Set(systemAdminEmails());
    const authorByExam = new Map<string, string>();
    const examCount = new Map<string, number>();
    exams.docs.forEach((item) => {
      const email = String(item.get("authorEmail") ?? "").toLowerCase();
      authorByExam.set(item.id, email);
      if (email) examCount.set(email, (examCount.get(email) ?? 0) + 1);
    });
    const done = new Map<string, number>();
    const lastActive = new Map<string, number>();
    const takenOnOwn = new Map<string, number>();
    submissions.docs.forEach((item) => {
      const student = String(item.get("studentEmail") ?? "").toLowerCase();
      const submitted = millis(item.get("submittedAt")) ?? 0;
      if (student) {
        done.set(student, (done.get(student) ?? 0) + 1);
        lastActive.set(student, Math.max(lastActive.get(student) ?? 0, submitted));
      }
      const author = authorByExam.get(String(item.get("examId") ?? ""));
      if (author) takenOnOwn.set(author, (takenOnOwn.get(author) ?? 0) + 1);
    });
    return NextResponse.json({
      users: users.docs.map((item) => {
        const data = item.data();
        const email = String(data.email ?? "").toLowerCase();
        return {
          uid: item.id, email, fullName: String(data.fullName ?? ""), school: String(data.school ?? ""),
          role: String(data.role ?? "student"), disabled: data.disabled === true,
          createdAtMillis: millis(data.createdAt),
          lastActiveMillis: lastActive.get(email) ?? null,
          submissions: done.get(email) ?? 0,
          exams: examCount.get(email) ?? 0,
          attemptsOnExams: takenOnOwn.get(email) ?? 0,
          protected: adminEmails.has(email),
        };
      }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/system/users failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

interface Body { uid?: string; action?: "approve" | "reject" | "disable" | "enable" | "setRole"; role?: string; reason?: string }

/** Duyệt giáo viên, khoá hoặc mở khoá, đổi vai trò. Mọi thao tác đều ghi nhật ký. */
export async function PATCH(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({})) as Body;
  if (!body.uid || !body.action) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const ref = adminDb.collection("users").doc(body.uid);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const data = snapshot.data()!;
    const email = String(data.email ?? "").toLowerCase();
    if (body.uid === auth.admin.uid || systemAdminEmails().includes(email) || data.role === "admin") {
      return NextResponse.json({ error: "PROTECTED_ACCOUNT" }, { status: 403 });
    }
    const label = `${data.fullName ?? ""} <${email}>`;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

    if (body.action === "approve" || body.action === "setRole") {
      const role = body.action === "approve" ? "mod" : body.role;
      if (!ROLES.includes(role as Role)) return NextResponse.json({ error: "INVALID_ROLE" }, { status: 400 });
      await ref.update({ role, updatedAt: FieldValue.serverTimestamp() });
      await logAdminAction(auth.admin, body.action === "approve" ? "user.approve_teacher" : "user.set_role", { type: "user", id: body.uid, label }, { from: data.role ?? null, to: role });
    } else if (body.action === "reject") {
      await ref.update({ role: "student", updatedAt: FieldValue.serverTimestamp() });
      await logAdminAction(auth.admin, "user.reject_teacher", { type: "user", id: body.uid, label }, { reason });
    } else if (body.action === "disable" || body.action === "enable") {
      const disabled = body.action === "disable";
      await ref.update({ disabled, ...(disabled ? { disabledReason: reason, disabledAt: FieldValue.serverTimestamp() } : { disabledReason: FieldValue.delete() }), updatedAt: FieldValue.serverTimestamp() });
      // Khoá đăng nhập ở Firebase Auth; cờ `disabled` trong hồ sơ cắt quyền ngay cả khi token cũ còn hạn.
      await adminAuth.updateUser(body.uid, { disabled }).catch((error) => console.error("Auth updateUser failed:", error));
      if (disabled) await adminAuth.revokeRefreshTokens(body.uid).catch(() => undefined);
      await logAdminAction(auth.admin, disabled ? "user.disable" : "user.enable", { type: "user", id: body.uid, label }, { reason });
    } else {
      return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/system/users failed:", error);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }
}
