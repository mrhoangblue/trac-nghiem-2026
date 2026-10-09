import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createR2DownloadUrl, deleteFromR2 } from "@/lib/r2Storage";
import { verifyAuth, type AuthContextData } from "@/lib/verifyAuth";

interface Access {
  authUser: AuthContextData;
  classData: FirebaseFirestore.DocumentData;
  isTeacher: boolean;
}

interface StoredFile {
  key: string;
  name: string;
  contentType: string;
  size: number;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : null;
}

function dateValue(value: unknown): Timestamp | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : Timestamp.fromDate(date);
}

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function storedFile(value: unknown, allowed: string[]): StoredFile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredFile>;
  const key = text(candidate.key, 1000);
  const name = text(candidate.name, 255);
  const contentType = text(candidate.contentType, 120);
  const size = Number(candidate.size ?? 0);
  const extension = name?.split(".").pop()?.toLowerCase() ?? "";
  if (!key?.startsWith("learning-materials/") || !name || !contentType || !allowed.includes(extension) || !Number.isFinite(size) || size <= 0 || size > 25 * 1024 * 1024) return null;
  return { key, name, contentType, size };
}

async function accessFor(request: NextRequest, classId: string): Promise<Access | NextResponse> {
  const authUser = await verifyAuth(request);
  if (!authUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const snapshot = await adminDb.collection("classes").doc(classId).get();
  if (!snapshot.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const classData = snapshot.data() ?? {};
  const isTeacher = classData.teacherId === authUser.uid || authUser.role === "admin";
  const isStudent = Array.isArray(classData.studentIds) && classData.studentIds.includes(authUser.uid);
  if (!isTeacher && !isStudent) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return { authUser, classData, isTeacher };
}

async function withDownloadUrls(files: StoredFile[]): Promise<Array<StoredFile & { downloadUrl: string }>> {
  return Promise.all(files.map(async (file) => ({
    ...file,
    downloadUrl: await createR2DownloadUrl(file.key),
  })));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params;
    const access = await accessFor(request, classId);
    if (access instanceof NextResponse) return access;
    const [announcementSnapshot, assignmentSnapshot, submissionSnapshot] = await Promise.all([
      adminDb.collection("class_announcements").where("classId", "==", classId).get(),
      adminDb.collection("class_assignments").where("classId", "==", classId).get(),
      adminDb.collection("class_assignment_submissions").where("classId", "==", classId).get(),
    ]);

    const announcements = announcementSnapshot.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        title: String(data.title ?? "Thông báo"),
        body: String(data.body ?? ""),
        kind: data.kind === "assignment" ? "assignment" : "general",
        ...(typeof data.assignmentId === "string" && { assignmentId: data.assignmentId }),
        createdAt: iso(data.createdAt),
      };
    }).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    const activeStudentIds = Array.isArray(access.classData.studentIds) ? access.classData.studentIds as string[] : [];
    const userSnapshots = access.isTeacher && activeStudentIds.length
      ? await adminDb.getAll(...activeStudentIds.map((id) => adminDb.collection("users").doc(id)))
      : [];
    const students = userSnapshots.map((snapshot) => ({
      studentId: snapshot.id,
      studentName: String(snapshot.data()?.fullName ?? "Học sinh"),
      studentEmail: String(snapshot.data()?.email ?? ""),
    }));

    const submissionsByAssignment = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    submissionSnapshot.docs.forEach((document) => {
      const assignmentId = String(document.data().assignmentId ?? "");
      if (!assignmentId) return;
      submissionsByAssignment.set(assignmentId, [...(submissionsByAssignment.get(assignmentId) ?? []), document]);
    });

    const assignments = await Promise.all(assignmentSnapshot.docs.map(async (document) => {
      const data = document.data();
      const dueAt = data.dueAt instanceof Timestamp ? data.dueAt.toDate() : null;
      const open = data.acceptingSubmissions !== false && (!dueAt || dueAt.getTime() >= Date.now());
      const attachment = storedFile(data.attachment, ["pdf"]);
      const assignmentSubmissions = submissionsByAssignment.get(document.id) ?? [];
      const visibleSubmissions = access.isTeacher
        ? assignmentSubmissions
        : assignmentSubmissions.filter((item) => item.data().studentId === access.authUser.uid);
      const serializedSubmissions = await Promise.all(visibleSubmissions.map(async (item) => {
        const submission = item.data();
        const files = Array.isArray(submission.files)
          ? submission.files.map((file) => storedFile(file, ["pdf", "png", "jpg", "jpeg", "webp"])).filter((file): file is StoredFile => Boolean(file))
          : [];
        return {
          id: item.id,
          studentId: String(submission.studentId ?? ""),
          studentName: String(submission.studentName ?? "Học sinh"),
          studentEmail: String(submission.studentEmail ?? ""),
          files: await withDownloadUrls(files),
          note: String(submission.note ?? ""),
          submittedAt: iso(submission.submittedAt),
        };
      }));
      const submittedIds = new Set(assignmentSubmissions.map((item) => String(item.data().studentId ?? "")));
      return {
        id: document.id,
        title: String(data.title ?? "Bài tập"),
        description: String(data.description ?? ""),
        dueAt: dueAt?.toISOString() ?? null,
        acceptingSubmissions: data.acceptingSubmissions !== false,
        status: open ? "open" : "closed",
        ...(attachment && { attachment: { ...attachment, downloadUrl: await createR2DownloadUrl(attachment.key, 60 * 60, true) } }),
        createdAt: iso(data.createdAt),
        ...(access.isTeacher ? {
          submittedCount: submittedIds.size,
          totalStudents: students.length,
          submissions: serializedSubmissions,
          missingStudents: students.filter((student) => !submittedIds.has(student.studentId)),
        } : {
          mySubmission: serializedSubmissions[0] ?? null,
        }),
      };
    }));
    assignments.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return NextResponse.json({
      viewerRole: access.isTeacher ? "teacher" : "student",
      announcements,
      assignments,
    });
  } catch (error) {
    console.error("GET class activity failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params;
    const access = await accessFor(request, classId);
    if (access instanceof NextResponse) return access;
    const body = await request.json() as Record<string, unknown>;

    if (body.action === "create_announcement") {
      if (!access.isTeacher) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      const title = text(body.title, 160);
      const announcementBody = text(body.body, 3000);
      if (!title || announcementBody === null) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      const reference = adminDb.collection("class_announcements").doc();
      await reference.set({ classId, teacherId: access.authUser.uid, title, body: announcementBody, kind: "general", createdAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ id: reference.id }, { status: 201 });
    }

    if (body.action === "create_assignment") {
      if (!access.isTeacher) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      const title = text(body.title, 160);
      const description = text(body.description ?? "", 3000);
      const dueAt = dateValue(body.dueAt);
      const attachment = storedFile(body.attachment, ["pdf"]);
      if (!title || description === null || dueAt === undefined || !attachment) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      const assignmentRef = adminDb.collection("class_assignments").doc();
      const announcementRef = adminDb.collection("class_announcements").doc();
      const batch = adminDb.batch();
      batch.set(assignmentRef, {
        classId,
        teacherId: access.authUser.uid,
        title,
        description,
        dueAt,
        attachment,
        acceptingSubmissions: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(announcementRef, {
        classId,
        teacherId: access.authUser.uid,
        title: `Bài tập mới: ${title}`,
        body: dueAt ? `Hạn nộp: ${dueAt.toDate().toLocaleString("vi-VN")}` : "Giáo viên vừa giao một bài tập mới.",
        kind: "assignment",
        assignmentId: assignmentRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return NextResponse.json({ id: assignmentRef.id }, { status: 201 });
    }

    if (body.action === "submit_assignment") {
      if (access.isTeacher) return NextResponse.json({ error: "STUDENT_ONLY" }, { status: 403 });
      const assignmentId = text(body.assignmentId, 200);
      const note = text(body.note ?? "", 1500);
      const files = Array.isArray(body.files)
        ? body.files.map((file) => storedFile(file, ["pdf", "png", "jpg", "jpeg", "webp"])).filter((file): file is StoredFile => Boolean(file))
        : [];
      if (!assignmentId || note === null || files.length === 0 || files.length > 10) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      const assignment = await adminDb.collection("class_assignments").doc(assignmentId).get();
      const assignmentData = assignment.data() ?? {};
      const dueAt = assignmentData.dueAt instanceof Timestamp ? assignmentData.dueAt.toDate() : null;
      if (!assignment.exists || assignmentData.classId !== classId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      if (assignmentData.acceptingSubmissions === false || (dueAt && dueAt.getTime() < Date.now())) return NextResponse.json({ error: "ASSIGNMENT_CLOSED" }, { status: 409 });
      const profile = await adminDb.collection("users").doc(access.authUser.uid).get();
      const submissionRef = adminDb.collection("class_assignment_submissions").doc(`${assignmentId}_${access.authUser.uid}`);
      const previousSubmission = await submissionRef.get();
      const previousFiles: StoredFile[] = Array.isArray(previousSubmission.data()?.files)
        ? (previousSubmission.data()!.files as unknown[]).map((file) => storedFile(file, ["pdf", "png", "jpg", "jpeg", "webp"])).filter((file): file is StoredFile => Boolean(file))
        : [];
      await submissionRef.set({
        classId,
        assignmentId,
        studentId: access.authUser.uid,
        studentName: String(profile.data()?.fullName ?? "Học sinh"),
        studentEmail: access.authUser.email,
        files,
        note,
        submittedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const nextKeys = new Set(files.map((file) => file.key));
      await Promise.allSettled(previousFiles.filter((file) => !nextKeys.has(file.key)).map((file) => deleteFromR2(file.key)));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    console.error("POST class activity failed:", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params;
    const access = await accessFor(request, classId);
    if (access instanceof NextResponse) return access;
    if (!access.isTeacher) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const assignmentId = text(body.assignmentId, 200);
    if (!assignmentId) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const reference = adminDb.collection("class_assignments").doc(assignmentId);
    const snapshot = await reference.get();
    if (!snapshot.exists || snapshot.data()?.classId !== classId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (body.action === "update_deadline") {
      const dueAt = dateValue(body.dueAt);
      if (dueAt === undefined) return NextResponse.json({ error: "INVALID_TIME" }, { status: 400 });
      await reference.update({ dueAt, acceptingSubmissions: true, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }
    if (body.action === "toggle_assignment") {
      await reference.update({ acceptingSubmissions: Boolean(body.acceptingSubmissions), updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    console.error("PATCH class activity failed:", error);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }
}
