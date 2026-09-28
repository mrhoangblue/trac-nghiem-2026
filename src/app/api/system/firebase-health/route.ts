import { createPrivateKey } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function connectionFailureCode(error: unknown): string {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = String(record.code ?? "").toLowerCase();
  const message = String(record.message ?? error ?? "").toLowerCase();
  const details = `${code} ${message}`;
  if (details.includes("invalid_grant") || details.includes("invalid jwt") || details.includes("unauthenticated")) {
    return "CREDENTIAL_REJECTED";
  }
  if (details.includes("permission-denied") || details.includes("permission_denied") || code === "7") {
    return "FIRESTORE_PERMISSION_DENIED";
  }
  if (details.includes("not-found") || details.includes("not_found") || code === "5") {
    return "FIRESTORE_DATABASE_NOT_FOUND";
  }
  if (details.includes("deadline-exceeded") || details.includes("deadline_exceeded") || code === "4") {
    return "FIRESTORE_TIMEOUT";
  }
  return "FIREBASE_CONNECTION_FAILED";
}

function normalize(value: string | undefined): string {
  if (!value) return "";
  let result = value.trim();
  if (
    (result.startsWith('"') && result.endsWith('"'))
    || (result.startsWith("'") && result.endsWith("'"))
  ) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

export async function GET() {
  const projectId = normalize(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = normalize(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalize(process.env.FIREBASE_PRIVATE_KEY)
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "");
  const missing = [
    !projectId && "FIREBASE_PROJECT_ID",
    !clientEmail && "FIREBASE_CLIENT_EMAIL",
    !privateKey && "FIREBASE_PRIVATE_KEY",
  ].filter((item): item is string => Boolean(item));

  if (missing.length > 0) {
    return NextResponse.json(
      { status: "error", code: "MISSING_ENV", missing },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!clientEmail.endsWith(".gserviceaccount.com")) {
    return NextResponse.json(
      { status: "error", code: "INVALID_CLIENT_EMAIL" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    createPrivateKey(privateKey);
  } catch {
    return NextResponse.json(
      { status: "error", code: "INVALID_PRIVATE_KEY" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { adminDb } = await import("@/lib/firebaseAdmin");
    await adminDb.collection("classes").limit(1).get();
    return NextResponse.json(
      { status: "ok", code: "FIREBASE_READY" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Firebase health check failed:", error);
    return NextResponse.json(
      { status: "error", code: connectionFailureCode(error) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
