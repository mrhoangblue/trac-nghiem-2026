import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth, type AuthContextData } from "@/lib/verifyAuth";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ classId: string; courseId: string; lessonId: string }>;
}

interface DiscussionAccess {
  authUser: AuthContextData;
  isTeacher: boolean;
  authorName: string;
  lessonKey: string;
  discussionKey: string;
  resourceId: string | null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return null;
}

async function getAccess(
  request: NextRequest,
  classId: string,
  courseId: string,
  lessonId: string,
  resourceId: string | null,
): Promise<DiscussionAccess | NextResponse> {
  const authUser = await verifyAuth(request);
  if (!authUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const [classSnapshot, courseSnapshot, userSnapshot] = await Promise.all([
    adminDb.collection("classes").doc(classId).get(),
    adminDb.collection("class_courses").doc(courseId).get(),
    adminDb.collection("users").doc(authUser.uid).get(),
  ]);
  if (!classSnapshot.exists || !courseSnapshot.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const classData = classSnapshot.data() ?? {};
  const courseData = courseSnapshot.data() ?? {};
  const isTeacher = classData.teacherId === authUser.uid || authUser.role === "admin";
  const isStudent = Array.isArray(classData.studentIds) && classData.studentIds.includes(authUser.uid);
  const lesson = Array.isArray(courseData.lessons)
    ? (courseData.lessons as Array<{ id?: unknown; resources?: Array<{ id?: unknown }> }>)
      .find((candidate) => candidate?.id === lessonId)
    : null;
  const resourceExists = !resourceId || (lesson && Array.isArray(lesson.resources)
    && lesson.resources.some((resource: { id?: unknown }) => resource?.id === resourceId));
  if (courseData.classId !== classId || !lesson || !resourceExists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!isTeacher && (!isStudent || courseData.published !== true)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const profile = userSnapshot.data() ?? {};
  const authorName = typeof profile.fullName === "string" && profile.fullName.trim()
    ? profile.fullName.trim()
    : authUser.email || (isTeacher ? "Giáo viên" : "Học sinh");
  const lessonKey = `${classId}:${courseId}:${lessonId}`;
  return {
    authUser,
    isTeacher,
    authorName,
    lessonKey,
    discussionKey: resourceId ? `${lessonKey}:${resourceId}` : lessonKey,
    resourceId,
  };
}

function serializeComment(document: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = document.data() ?? {};
  return {
    id: document.id,
    body: String(data.body ?? ""),
    authorId: String(data.authorId ?? ""),
    authorName: String(data.authorName ?? "Người dùng"),
    authorRole: data.authorRole === "teacher" ? "teacher" : "student",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { classId, courseId, lessonId } = await params;
    const resourceId = request.nextUrl.searchParams.get("resourceId")?.trim() || null;
    const access = await getAccess(request, classId, courseId, lessonId, resourceId);
    if (access instanceof NextResponse) return access;
    const snapshot = await adminDb.collection("class_lesson_comments")
      .where(access.resourceId ? "discussionKey" : "lessonKey", "==", access.resourceId ? access.discussionKey : access.lessonKey)
      .limit(200)
      .get();
    const comments = snapshot.docs
      .map(serializeComment)
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    return NextResponse.json({ comments, viewerId: access.authUser.uid, canModerate: access.isTeacher });
  } catch (error) {
    console.error("GET lesson comments failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { classId, courseId, lessonId } = await params;
    const resourceId = request.nextUrl.searchParams.get("resourceId")?.trim() || null;
    const access = await getAccess(request, classId, courseId, lessonId, resourceId);
    if (access instanceof NextResponse) return access;
    const payload = await request.json() as { body?: unknown };
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body || body.length > 1500) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const commentRef = adminDb.collection("class_lesson_comments").doc();
    await commentRef.set({
      lessonKey: access.lessonKey,
      discussionKey: access.discussionKey,
      classId,
      courseId,
      lessonId,
      resourceId: access.resourceId,
      body,
      authorId: access.authUser.uid,
      authorName: access.authorName,
      authorRole: access.isTeacher ? "teacher" : "student",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const created = await commentRef.get();
    return NextResponse.json({ comment: serializeComment(created) }, { status: 201 });
  } catch (error) {
    console.error("POST lesson comment failed:", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { classId, courseId, lessonId } = await params;
    const resourceId = request.nextUrl.searchParams.get("resourceId")?.trim() || null;
    const access = await getAccess(request, classId, courseId, lessonId, resourceId);
    if (access instanceof NextResponse) return access;
    const commentId = request.nextUrl.searchParams.get("commentId")?.trim();
    if (!commentId) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const commentRef = adminDb.collection("class_lesson_comments").doc(commentId);
    const comment = await commentRef.get();
    const data = comment.data();
    const storedDiscussionKey = typeof data?.discussionKey === "string" ? data.discussionKey : data?.lessonKey;
    if (!comment.exists || storedDiscussionKey !== access.discussionKey) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (!access.isTeacher && data?.authorId !== access.authUser.uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    await commentRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE lesson comment failed:", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }
}
