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

    const classId = request.nextUrl.searchParams.get("classId")?.trim();
    // Màn hình chấm tự luận hiện cả bài thử của giáo viên (Chế độ học sinh) để kiểm tra luồng chấm.
    const includePreview = request.nextUrl.searchParams.get("includePreview") === "1";
    let classStudentEmails: Set<string> | null = null;
    let classStudentIds: Set<string> | null = null;
    if (classId) {
      const classSnapshot = await adminDb.collection("classes").doc(classId).get();
      if (!classSnapshot.exists) return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
      const classData = classSnapshot.data() ?? {};
      if (authUser.role !== "admin" && classData.teacherId !== authUser.uid) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      const assignedClassIds = [...(Array.isArray(exam.targetClassIds) ? exam.targetClassIds : []), ...(Array.isArray(exam.classIds) ? exam.classIds : [])];
      if (!assignedClassIds.includes(classId)) {
        return NextResponse.json({ error: "EXAM_NOT_ASSIGNED_TO_CLASS" }, { status: 403 });
      }
      const studentIds: string[] = Array.isArray(classData.studentIds)
        ? classData.studentIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
        : [];
      classStudentIds = new Set(studentIds);
      const [profiles, members] = await Promise.all([
        studentIds.length ? adminDb.getAll(...studentIds.map((id) => adminDb.collection("users").doc(id))) : Promise.resolve([]),
        adminDb.collection("class_members").where("classId", "==", classId).get(),
      ]);
      const membershipEmails = new Map(members.docs.map((member) => [member.data().studentId, member.data().studentEmail]));
      classStudentEmails = new Set(profiles.map((profile) => String(profile.data()?.email ?? membershipEmails.get(profile.id) ?? "").trim().toLowerCase()).filter(Boolean));
    }

    // Phần I: thứ tự câu và đáp án đúng, để thống kê học sinh chọn nhầm phương án nào.
    // Đề trộn mã đảo thứ tự phương án theo từng mã nên không gộp được.
    const versioned = (exam.versioning as { enabled?: unknown } | undefined)?.enabled === true;
    const p1Questions = (Array.isArray(exam.questions) ? exam.questions as Array<{ id?: unknown; type?: unknown; correctAnswer?: unknown }> : [])
      .filter((question) => question?.type === "multiple_choice");
    const p1Correct = versioned ? [] : p1Questions.map((question) => (typeof question.correctAnswer === "number" ? question.correctAnswer : null));
    const p1ChoicesOf = (submission: Record<string, unknown>): Array<number | null> | null => {
      if (versioned || typeof submission.examCode === "string" || typeof submission.answersJson !== "string") return null;
      try {
        const answers = (JSON.parse(submission.answersJson) as { p1Ans?: Record<string, unknown> }).p1Ans ?? {};
        return p1Questions.map((question) => {
          const choice = answers[String(question.id)];
          return typeof choice === "number" && Number.isInteger(choice) ? choice : null;
        });
      } catch {
        return null;
      }
    };

    const snapshot = await adminDb.collection("submissions").where("examId", "==", examId).get();
    const submissions = snapshot.docs
      .map((document) => ({ id: document.id, ...document.data() } as Record<string, unknown> & { id: string }))
      .filter((submission) => (
        (submission.status === "COMPLETED" || typeof submission.status !== "string")
        && (includePreview || submission.isTeacherPreview !== true)
        && (!classId || (
          (!submission.classId || submission.classId === classId)
          && (typeof submission.studentId === "string" && submission.studentId
            ? classStudentIds!.has(submission.studentId)
            : classStudentEmails!.has(String(submission.studentEmail ?? "").trim().toLowerCase()))
        ))
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
        gradingStatus: submission.gradingStatus === "pending" || submission.gradingStatus === "graded" ? submission.gradingStatus : null,
        essayFileCount: Array.isArray((submission.essay as { files?: unknown[] } | undefined)?.files)
          ? (submission.essay as { files: unknown[] }).files.length
          : 0,
        isTeacherPreview: submission.isTeacherPreview === true,
        examCode: typeof submission.examCode === "string" ? submission.examCode : null,
        studentId: typeof submission.studentId === "string" && submission.studentId
          ? submission.studentId
          : typeof submission.uid === "string" ? submission.uid : null,
        p1Choices: p1ChoicesOf(submission),
      }));

    // Các lớp được giao đề mà người gọi quản lý, kèm danh sách học sinh: dùng để
    // lọc theo lớp, so sánh lớp và biết ai chưa nộp.
    const assignedIds = Array.from(new Set([
      ...(Array.isArray(exam.targetClassIds) ? exam.targetClassIds : []),
      ...(Array.isArray(exam.classIds) ? exam.classIds : []),
    ].filter((value: unknown): value is string => typeof value === "string" && value.length > 0))).slice(0, 30);
    const classSnapshots = assignedIds.length
      ? await adminDb.getAll(...assignedIds.map((value) => adminDb.collection("classes").doc(value)))
      : [];
    const classes = await Promise.all(classSnapshots
      .filter((item) => item.exists && (authUser.role === "admin" || item.data()?.teacherId === authUser.uid))
      .map(async (item) => {
        const data = item.data() ?? {};
        const ids: string[] = (Array.isArray(data.studentIds) ? data.studentIds : [])
          .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
          .slice(0, 300);
        const profiles = ids.length
          ? await adminDb.getAll(...ids.map((value) => adminDb.collection("users").doc(value)), { fieldMask: ["fullName", "displayName", "email"] })
          : [];
        return {
          id: item.id,
          name: typeof data.name === "string" ? data.name : "Lớp học",
          students: profiles.map((profile) => ({
            uid: profile.id,
            name: String(profile.data()?.fullName ?? profile.data()?.displayName ?? profile.data()?.email ?? "Học sinh"),
            email: String(profile.data()?.email ?? ""),
          })),
        };
      }));
    classes.sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));

    return NextResponse.json({ submissions, classes, p1Correct }, { headers: { "Cache-Control": "private, no-store" } });
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
