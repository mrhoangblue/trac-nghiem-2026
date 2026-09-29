import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { loadExamSource, normalizeRawLatex } from "@/lib/examSourceStorage";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { examId } = await params;
    const snapshot = await adminDb.collection("exams").doc(examId).get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const exam = snapshot.data() ?? {};
    const authorEmail = String(exam.authorEmail ?? "").trim().toLowerCase();
    const canRead = authUser.role === "admin"
      || authorEmail === authUser.email.toLowerCase()
      || Boolean(exam.isShared);
    if (!canRead) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const legacySource = normalizeRawLatex(exam.rawLatex);
    const rawLatex = legacySource ?? (
      exam.rawLatexSource ? await loadExamSource(exam.rawLatexSource) : null
    );
    if (!rawLatex) {
      return NextResponse.json({ error: "SOURCE_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(
      { rawLatex, source: legacySource ? "firestore-legacy" : "r2-encrypted" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("GET /api/exams/[examId]/source failed:", error);
    return NextResponse.json({ error: "SOURCE_LOAD_FAILED" }, { status: 500 });
  }
}
