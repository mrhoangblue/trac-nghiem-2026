import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireSystemAdmin } from "@/lib/systemAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTIONS = ["users", "exams", "submissions", "classes", "class_members", "class_assignments", "class_courses", "class_announcements", "notifications", "push_subscriptions", "essay_ai_grading", "admin_audit_logs"];

async function timed<T>(run: () => Promise<T>): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  try { await run(); return { ok: true, ms: Date.now() - start }; } catch { return { ok: false, ms: Date.now() - start }; }
}

/** Tình trạng dịch vụ và cấu hình: chỉ trả đúng/sai và độ trễ, không bao giờ trả giá trị khóa hay mật khẩu. */
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  const env = process.env;
  const [firestore, authService, counts] = await Promise.all([
    timed(() => adminDb.collection("users").limit(1).get()),
    timed(() => adminAuth.listUsers(1)),
    Promise.all(COLLECTIONS.map(async (name) => {
      try { return { name, count: (await adminDb.collection(name).count().get()).data().count }; } catch { return { name, count: null as number | null }; }
    })),
  ]);
  const flag = (...names: string[]) => names.every((name) => Boolean(env[name]?.trim()));
  return NextResponse.json({
    services: [
      { key: "firestore", label: "Cơ sở dữ liệu Firestore", ...firestore },
      { key: "auth", label: "Đăng nhập Firebase Auth", ...authService },
    ],
    config: [
      { key: "ai", label: "Chấm AI và sửa LaTeX (Gemini)", on: flag("GEMINI_API_KEY"), note: env.AI_GRADING_MODEL?.trim() || "mô hình mặc định" },
      { key: "storage", label: "Lưu ảnh bài làm (R2)", on: flag("R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY") && (flag("R2_ENDPOINT") || flag("R2_ACCOUNT_ID")), note: "" },
      { key: "push", label: "Thông báo đẩy trình duyệt", on: flag("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"), note: "" },
      { key: "email", label: "Gửi email", on: flag("EMAIL_USER", "EMAIL_PASS"), note: "" },
      { key: "cron", label: "Nhắc hạn bài tập tự động", on: flag("CRON_SECRET"), note: "mỗi ngày 08:00 giờ Việt Nam" },
      { key: "tikz", label: "Vẽ hình TikZ", on: flag("TIKZ_RENDER_ENDPOINT"), note: "" },
      { key: "sourceKey", label: "Mã hóa file nguồn đề", on: flag("EXAM_SOURCE_ENCRYPTION_KEY"), note: "" },
      { key: "admins", label: "Tài khoản quản trị hệ thống", on: flag("SYSTEM_ADMIN_EMAILS"), note: "" },
    ],
    counts,
    runtime: { node: process.version, region: env.VERCEL_REGION ?? "", vercel: Boolean(env.VERCEL) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
