import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
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

export async function DELETE(
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

    const body = await request.json().catch(() => null) as { studentEmail?: unknown } | null;
    const studentEmail = typeof body?.studentEmail === "string"
      ? body.studentEmail.trim().toLowerCase()
      : "";
    if (!studentEmail || studentEmail.length > 320) {
      return NextResponse.json({ error: "STUDENT_EMAIL_REQUIRED" }, { status: 400 });
    }

    // Query by examId only to avoid requiring a fragile composite index, then
    // enforce the selected student and exclude teacher-preview submissions.
    const snapshot = await adminDb.collection("submissions").where("examId", "==", examId).get();
    const documents = snapshot.docs.filter((document) => {
      const submission = document.data();
      return String(submission.studentEmail ?? "").trim().toLowerCase() === studentEmail
        && submission.isTeacherPreview !== true;
    });

    // Firestore batches support at most 500 writes. Keep room for future audit
    // additions and handle even an unexpectedly large number of attempts.
    for (let offset = 0; offset < documents.length; offset += 450) {
      const batch = adminDb.batch();
      documents.slice(offset, offset + 450).forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }

    await adminDb.collection("submission_reset_audits").add({
      examId,
      examTitle: String(exam.title ?? "Bài thi"),
      studentEmail,
      deletedSubmissionCount: documents.length,
      deletedSubmissionIds: documents.slice(0, 100).map((document) => document.id),
      resetByUid: authUser.uid,
      resetByEmail: authUser.email,
      resetAt: FieldValue.serverTimestamp(),
    }).catch((auditError) => {
      // The reset itself has already completed. A temporary audit-write issue
      // must not make the UI report that the reset failed.
      console.error("Failed to record submission reset audit:", auditError);
    });

    return NextResponse.json({ success: true, deletedCount: documents.length });
  } catch (error) {
    console.error("DELETE /api/exams/[examId]/submissions failed:", error);
    return NextResponse.json({ error: "SUBMISSION_RESET_FAILED" }, { status: 500 });
  }
}
