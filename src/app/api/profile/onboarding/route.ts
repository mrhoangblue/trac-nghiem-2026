import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import { generateSearchKeywords } from "@/utils/searchKeywords";

export const runtime = "nodejs";

type OnboardingRole = "student" | "pending_teacher";
const EXISTING_ROLES = ["admin", "mod", "student", "pending_teacher"] as const;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function cleanPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\s().-]+/g, "");
  if (!/^\+?\d{9,15}$/.test(normalized)) return null;
  return normalized;
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.uid || !authUser.email) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      role?: unknown;
      fullName?: unknown;
      school?: unknown;
      className?: unknown;
      phoneNumber?: unknown;
    } | null;
    const role = body?.role as OnboardingRole;
    const fullName = cleanText(body?.fullName, 120);
    const school = cleanText(body?.school, 200);
    const className = cleanText(body?.className, 80);
    const phoneNumber = cleanPhone(body?.phoneNumber);

    if (
      !["student", "pending_teacher"].includes(role)
      || !fullName
      || !school
      || !phoneNumber
    ) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(authUser.uid);
    const snapshot = await userRef.get();
    const existingRole = snapshot.data()?.role;
    const nextRole = EXISTING_ROLES.includes(existingRole) ? existingRole : role;

    if (nextRole === "student" && !className) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const profile = {
      uid: authUser.uid,
      email: authUser.email,
      fullName,
      school,
      phoneNumber,
      role: nextRole,
      searchKeywords: generateSearchKeywords(fullName, authUser.email, phoneNumber),
      ...(nextRole === "student" ? { class: className } : { class: FieldValue.delete() }),
      ...(!snapshot.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await userRef.set(profile, { merge: true });
    return NextResponse.json({
      success: true,
      profile: {
        uid: authUser.uid,
        email: authUser.email,
        fullName,
        school,
        phoneNumber,
        role: nextRole,
        class: nextRole === "student" ? className : "",
      },
    });
  } catch (error) {
    console.error("POST /api/profile/onboarding failed:", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}
