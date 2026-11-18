import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "./firebaseAdmin";

/**
 * Quản trị chủ hệ thống: tách hẳn khỏi giáo viên. Quyền chỉ đến từ danh sách email trong biến môi trường
 * SYSTEM_ADMIN_EMAILS (ngăn cách bằng dấu phẩy) và luôn được kiểm ở máy chủ trên token đã xác minh email.
 * Chưa đặt biến thì tạm dùng email chủ hiện tại để không mất quyền.
 */
const FALLBACK_ADMIN = "mrhoangblue@gmail.com";

export interface SystemAdmin {
  uid: string;
  email: string;
}

export function systemAdminEmails(): string[] {
  const raw = process.env.SYSTEM_ADMIN_EMAILS?.trim();
  return (raw ? raw.split(",") : [FALLBACK_ADMIN]).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export async function requireSystemAdmin(request: NextRequest): Promise<{ admin: SystemAdmin } | { response: NextResponse }> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return { response: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    const email = (decoded.email ?? "").toLowerCase();
    if (!email || decoded.email_verified !== true || !systemAdminEmails().includes(email)) {
      return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
    }
    return { admin: { uid: decoded.uid, email } };
  } catch {
    return { response: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }
}

export interface AuditTarget {
  type: "user" | "exam" | "system";
  id: string;
  label?: string;
}

/** Ghi lại một thao tác quản trị. Lỗi ghi nhật ký không được làm hỏng thao tác chính nhưng phải để lại dấu vết. */
export async function logAdminAction(admin: SystemAdmin, action: string, target: AuditTarget, detail?: Record<string, unknown>) {
  try {
    await adminDb.collection("admin_audit_logs").add({
      action,
      targetType: target.type,
      targetId: target.id,
      targetLabel: target.label ?? "",
      detail: detail ?? {},
      adminEmail: admin.email,
      adminUid: admin.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Write admin audit log failed:", error);
  }
}

export function millis(value: unknown): number | null {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "number") return value;
  if (typeof value === "string") { const parsed = Date.parse(value); return Number.isNaN(parsed) ? null : parsed; }
  return null;
}

/** Khóa ngày theo giờ Việt Nam, dạng yyyy-mm-dd. */
export function vnDay(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}
