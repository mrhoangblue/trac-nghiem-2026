import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth, type AuthContextData } from "@/lib/verifyAuth";
import { parseExamDateTime } from "@/lib/examAccess";
import { normalizeResourceLink } from "@/utils/classResourceLinks";
import type {
  ClassCourseResource,
  ClassExamStatus,
  ClassResourceType,
} from "@/utils/classroomTypes";

interface RouteParams {
  params: Promise<{ classId: string }>;
}

interface RequestBody {
  action?: unknown;
  courseId?: unknown;
  resourceId?: unknown;
  direction?: unknown;
  title?: unknown;
  description?: unknown;
  published?: unknown;
  type?: unknown;
  url?: unknown;
}

interface ClassAccess {
  authUser: AuthContextData;
  classRef: FirebaseFirestore.DocumentReference;
  classData: FirebaseFirestore.DocumentData;
  isTeacher: boolean;
}

function textValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const valueTrimmed = value.trim();
  return valueTrimmed.length <= maxLength ? valueTrimmed : null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

function examStatus(startTime: unknown, endTime: unknown): ClassExamStatus {
  const now = Date.now();
  const start = parseExamDateTime(startTime)?.getTime();
  const end = parseExamDateTime(endTime)?.getTime();
  if (start !== undefined && now < start) return "upcoming";
  if (end !== undefined && now > end) return "closed";
  return "open";
}

async function getAccess(request: NextRequest, classId: string): Promise<ClassAccess | NextResponse> {
  const authUser = await verifyAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const classRef = adminDb.collection("classes").doc(classId);
  const classSnapshot = await classRef.get();
  if (!classSnapshot.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const classData = classSnapshot.data() ?? {};
  const isTeacher = classData.teacherId === authUser.uid || authUser.role === "admin";
  const isStudent = Array.isArray(classData.studentIds) && classData.studentIds.includes(authUser.uid);
  if (!isTeacher && !isStudent) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  return { authUser, classRef, classData, isTeacher };
}

async function getCourse(classId: string, courseId: string) {
  const courseRef = adminDb.collection("class_courses").doc(courseId);
  const courseSnapshot = await courseRef.get();
  if (!courseSnapshot.exists || courseSnapshot.data()?.classId !== classId) return null;
  return { courseRef, courseSnapshot };
}

function serializeCourse(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = document.data();
  return {
    id: document.id,
    title: String(data.title ?? "Khóa học chưa đặt tên"),
    description: String(data.description ?? ""),
    published: Boolean(data.published),
    resources: Array.isArray(data.resources) ? data.resources : [],
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { classId } = await params;
    const access = await getAccess(request, classId);
    if (access instanceof NextResponse) return access;

    const [courseSnapshot, targetExamSnapshot, legacyExamSnapshot] = await Promise.all([
      adminDb.collection("class_courses").where("classId", "==", classId).get(),
      adminDb.collection("exams").where("targetClassIds", "array-contains", classId).get(),
      adminDb.collection("exams").where("classIds", "array-contains", classId).get(),
    ]);

    const courses = courseSnapshot.docs
      .filter((course) => access.isTeacher || course.data().published === true)
      .map(serializeCourse)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    const examDocuments = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...targetExamSnapshot.docs, ...legacyExamSnapshot.docs].forEach((document) => {
      examDocuments.set(document.id, document);
    });

    const submissions = new Map<string, { id: string; totalScore?: number; submittedAt: number }>();
    if (!access.isTeacher && access.authUser.email) {
      const submissionSnapshot = await adminDb
        .collection("submissions")
        .where("studentEmail", "==", access.authUser.email)
        .get();
      submissionSnapshot.docs.forEach((document) => {
        const data = document.data();
        if (data.status !== "COMPLETED" || typeof data.examId !== "string") return;
        const submittedAt = data.submittedAt instanceof Timestamp ? data.submittedAt.toMillis() : 0;
        const previous = submissions.get(data.examId);
        if (!previous || submittedAt >= previous.submittedAt) {
          submissions.set(data.examId, {
            id: document.id,
            totalScore: typeof data.scores?.total === "number" ? data.scores.total : undefined,
            submittedAt,
          });
        }
      });
    }

    const exams = [...examDocuments.values()].map((document) => {
      const data = document.data();
      const submission = submissions.get(document.id);
      return {
        id: document.id,
        title: String(data.title ?? "Bài kiểm tra chưa đặt tên"),
        description: String(data.description ?? ""),
        questionCount: Number(data.questionCount ?? (Array.isArray(data.questions) ? data.questions.length : 0)),
        duration: Number(data.duration ?? 0),
        startTime: typeof data.startTime === "string" ? data.startTime : null,
        endTime: typeof data.endTime === "string" ? data.endTime : null,
        createdAt: toIso(data.createdAt),
        status: examStatus(data.startTime, data.endTime),
        submitted: Boolean(submission),
        ...(submission && {
          submissionId: submission.id,
          totalScore: submission.totalScore,
        }),
      };
    });

    return NextResponse.json({
      class: {
        id: classId,
        name: String(access.classData.name ?? "Lớp học"),
        description: String(access.classData.description ?? ""),
        teacherName: String(access.classData.teacherName ?? ""),
      },
      viewerRole: access.isTeacher ? "teacher" : "student",
      courses,
      exams,
    });
  } catch (error) {
    console.error("GET /api/classes/[classId]/content failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { classId } = await params;
    const access = await getAccess(request, classId);
    if (access instanceof NextResponse) return access;
    if (!access.isTeacher) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const title = textValue(body?.title, 120);
    const description = textValue(body?.description ?? "", 1000);
    if (!title || description === null || typeof body?.published !== "boolean") {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const courseRef = adminDb.collection("class_courses").doc();
    await courseRef.set({
      classId,
      teacherId: access.authUser.uid,
      title,
      description,
      published: body.published,
      resources: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: courseRef.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/classes/[classId]/content failed:", error);
    return NextResponse.json({ error: "CREATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { classId } = await params;
    const access = await getAccess(request, classId);
    if (access instanceof NextResponse) return access;
    if (!access.isTeacher) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const courseId = textValue(body?.courseId, 200);
    if (!courseId) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const course = await getCourse(classId, courseId);
    if (!course) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const data = course.courseSnapshot.data() ?? {};
    const resources = Array.isArray(data.resources)
      ? [...data.resources] as ClassCourseResource[]
      : [];

    if (body?.action === "update_course") {
      const title = textValue(body.title, 120);
      const description = textValue(body.description ?? "", 1000);
      if (!title || description === null || typeof body.published !== "boolean") {
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      }
      await course.courseRef.update({
        title,
        description,
        published: body.published,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    if (body?.action === "save_resource") {
      const title = textValue(body.title, 160);
      const description = textValue(body.description ?? "", 1000);
      const type = body.type as ClassResourceType;
      if (!title || description === null || !["pdf", "video", "slides"].includes(type)) {
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      }
      const normalized = normalizeResourceLink(typeof body.url === "string" ? body.url : "", type);
      if (!normalized) {
        return NextResponse.json({ error: "INVALID_URL" }, { status: 400 });
      }

      const resourceId = textValue(body.resourceId, 200);
      const existingIndex = resourceId ? resources.findIndex((item) => item.id === resourceId) : -1;
      if (existingIndex < 0 && resources.length >= 100) {
        return NextResponse.json({ error: "RESOURCE_LIMIT" }, { status: 400 });
      }
      const resource: ClassCourseResource = {
        id: existingIndex >= 0 ? resources[existingIndex].id : adminDb.collection("class_courses").doc().id,
        title,
        description,
        type,
        ...normalized,
        createdAt: existingIndex >= 0 ? resources[existingIndex].createdAt : new Date().toISOString(),
      };
      if (existingIndex >= 0) resources[existingIndex] = resource;
      else resources.push(resource);

      await course.courseRef.update({ resources, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true, resource });
    }

    if (body?.action === "delete_resource") {
      const resourceId = textValue(body.resourceId, 200);
      if (!resourceId) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      await course.courseRef.update({
        resources: resources.filter((item) => item.id !== resourceId),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    if (body?.action === "move_resource") {
      const resourceId = textValue(body.resourceId, 200);
      const direction = body.direction === "up" ? -1 : body.direction === "down" ? 1 : 0;
      const index = resourceId ? resources.findIndex((item) => item.id === resourceId) : -1;
      const nextIndex = index + direction;
      if (!direction || index < 0 || nextIndex < 0 || nextIndex >= resources.length) {
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      }
      [resources[index], resources[nextIndex]] = [resources[nextIndex], resources[index]];
      await course.courseRef.update({ resources, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/classes/[classId]/content failed:", error);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { classId } = await params;
    const access = await getAccess(request, classId);
    if (access instanceof NextResponse) return access;
    if (!access.isTeacher) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const courseId = request.nextUrl.searchParams.get("courseId")?.trim();
    if (!courseId) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const course = await getCourse(classId, courseId);
    if (!course) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await course.courseRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/classes/[classId]/content failed:", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }
}
