import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
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
    const examSnapshot = await adminDb.collection("exams").doc(examId).get();
    if (!examSnapshot.exists) {
      return NextResponse.json({ error: "EXAM_NOT_FOUND" }, { status: 404 });
    }
    const exam = examSnapshot.data() ?? {};
    if (
      authUser.role !== "admin"
      && String(exam.authorEmail ?? "").toLowerCase() !== authUser.email.toLowerCase()
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const snapshot = await adminDb.collection("submissions").where("examId", "==", examId).get();
    const submissions = snapshot.docs
      .map((document) => ({ id: document.id, ...document.data() } as Record<string, unknown> & { id: string }))
      .filter((submission) => (
        (submission.status === "COMPLETED" || typeof submission.status !== "string")
        && submission.isTeacherPreview !== true
      ))
      .map((submission) => ({
        id: submission.id,
        studentName: submission.studentName ?? "Học sinh",
        studentEmail: submission.studentEmail ?? "—",
        studentAvatar: submission.studentAvatar ?? "",
        submittedAtMillis: (submission.submittedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null,
        scores: submission.scores && typeof submission.scores === "object"
          ? submission.scores
          : { p1: 0, p2: 0, p3: 0, total: 0 },
        part1Results: Array.isArray(submission.part1Results) ? submission.part1Results : [],
        part2Results: Array.isArray(submission.part2Results) ? submission.part2Results : [],
        part3Results: Array.isArray(submission.part3Results) ? submission.part3Results : [],
        cheatCount: Number(submission.cheatCount ?? 0),
        totalElapsedSeconds: Number(submission.totalElapsedSeconds ?? 0),
        idleBeforeSubmitSeconds: Number(submission.idleBeforeSubmitSeconds ?? 0),
      }));
    return NextResponse.json({ submissions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/exams/[examId]/submissions failed:", error);
    return NextResponse.json({ error: "SUBMISSIONS_LOAD_FAILED" }, { status: 500 });
  }
}
