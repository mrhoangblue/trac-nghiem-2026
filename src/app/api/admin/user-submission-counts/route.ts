import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";

/** Số bài nộp theo email cho trang quản lý người dùng. Chỉ admin. */
export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || authUser.role !== "admin") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const snapshot = await adminDb.collection("submissions").select("studentEmail").get();
    const counts: Record<string, number> = {};
    snapshot.docs.forEach((document) => {
      const email = document.get("studentEmail");
      if (typeof email === "string" && email) counts[email] = (counts[email] ?? 0) + 1;
    });
    return NextResponse.json({ counts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/admin/user-submission-counts failed:", error);
    return NextResponse.json({ error: "COUNTS_LOAD_FAILED" }, { status: 500 });
  }
}
