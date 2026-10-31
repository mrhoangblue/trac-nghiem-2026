import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import { generateSearchKeywords } from "@/utils/searchKeywords";
import { mergeUserSettings, resolveUserSettings } from "@/utils/userSettings";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function cleanPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\s().-]+/g, "");
  return /^\+?\d{9,15}$/.test(normalized) ? normalized : null;
}

/**
 * Chính chủ sửa hồ sơ và cài đặt qua Admin SDK, nên chỉ những trường kiểm tra
 * ở đây mới được ghi (vai trò, email... không bao giờ đổi qua route này).
 */
export async function PATCH(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.uid || !authUser.email) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      fullName?: unknown;
      school?: unknown;
      phoneNumber?: unknown;
      className?: unknown;
      settings?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

    const userRef = adminDb.collection("users").doc(authUser.uid);
    const snapshot = await userRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const current = snapshot.data() ?? {};
    const isTeacher = ["admin", "mod", "pending_teacher"].includes(String(current.role));

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const invalid: string[] = [];

    if ("fullName" in body) {
      const fullName = cleanText(body.fullName, 120);
      if (fullName) updates.fullName = fullName; else invalid.push("fullName");
    }
    if ("school" in body) {
      const school = cleanText(body.school, 200);
      if (school) updates.school = school; else invalid.push("school");
    }
    if ("phoneNumber" in body) {
      const raw = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
      const phone = cleanPhone(raw);
      if (phone) updates.phoneNumber = phone;
      else if (!raw && !isTeacher) updates.phoneNumber = FieldValue.delete();
      else invalid.push("phoneNumber");
    }
    if ("className" in body && !isTeacher) {
      const className = cleanText(body.className, 80);
      if (className) updates.class = className; else invalid.push("className");
    }
    if (invalid.length) return NextResponse.json({ error: "INVALID_INPUT", fields: invalid }, { status: 400 });

    if ("fullName" in updates || "phoneNumber" in updates) {
      const fullName = String(updates.fullName ?? current.fullName ?? "");
      const phone = typeof updates.phoneNumber === "string" ? updates.phoneNumber : String(current.phoneNumber ?? "");
      updates.searchKeywords = generateSearchKeywords(fullName, authUser.email, phone);
    }

    let settings = resolveUserSettings(current.settings);
    if (body.settings !== undefined) {
      settings = mergeUserSettings(settings, body.settings);
      updates.settings = settings;
    }

    await userRef.set(updates, { merge: true });
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("PATCH /api/profile failed:", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}
