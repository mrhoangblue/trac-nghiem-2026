import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import { progressDocumentId } from "@/utils/courseProgress";
import type { ClassCourseLesson, ClassCourseResource } from "@/utils/classroomTypes";

interface RouteParams {
  params: Promise<{ classId: string }>;
}

interface ProgressBody {
  courseId?: unknown;
  resourceId?: unknown;
}

function courseResources(data: FirebaseFirestore.DocumentData): ClassCourseResource[] {
  if (Array.isArray(data.lessons)) {
    return (data.lessons as ClassCourseLesson[]).flatMap((lesson) =>
      Array.isArray(lesson.resources) ? lesson.resources : [],
    );
  }
  return Array.isArray(data.resources) ? data.resources : [];
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const { classId } = await params;
    const body = (await request.json().catch(() => null)) as ProgressBody | null;
    const courseId = typeof body?.courseId === "string" ? body.courseId.trim() : "";
    const resourceId = typeof body?.resourceId === "string" ? body.resourceId.trim() : "";
    if (!courseId || !resourceId) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const [classSnapshot, courseSnapshot] = await Promise.all([
      adminDb.collection("classes").doc(classId).get(),
      adminDb.collection("class_courses").doc(courseId).get(),
    ]);
    if (!classSnapshot.exists || !courseSnapshot.exists || courseSnapshot.data()?.classId !== classId) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const classData = classSnapshot.data() ?? {};
    const isMember = Array.isArray(classData.studentIds) && classData.studentIds.includes(authUser.uid);
    if (!isMember) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    if (courseSnapshot.data()?.published !== true) {
      return NextResponse.json({ error: "COURSE_NOT_PUBLISHED" }, { status: 403 });
    }

    const resources = courseResources(courseSnapshot.data() ?? {});
    const resourceIndex = resources.findIndex((resource) => resource.id === resourceId);
    if (resourceIndex < 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const progressRef = adminDb
      .collection("class_course_progress")
      .doc(progressDocumentId(classId, courseId, authUser.uid));
    const progressSnapshot = await progressRef.get();
    const previousCompleted = progressSnapshot.data()?.completedResourceIds;
    const completedResourceIds: string[] = Array.isArray(previousCompleted) ? previousCompleted : [];
    const completedSet = new Set(completedResourceIds);
    const prerequisitesMet = resources
      .slice(0, resourceIndex)
      .every((resource) => completedSet.has(resource.id));
    if (!prerequisitesMet) {
      return NextResponse.json({ error: "PREREQUISITE_REQUIRED" }, { status: 409 });
    }

    const nextCompleted = completedSet.has(resourceId)
      ? completedResourceIds
      : [...completedResourceIds, resourceId];
    await progressRef.set({
      classId,
      courseId,
      studentId: authUser.uid,
      completedResourceIds: nextCompleted,
      updatedAt: FieldValue.serverTimestamp(),
      ...(!progressSnapshot.exists && { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    return NextResponse.json({ success: true, completedResourceIds: nextCompleted });
  } catch (error) {
    console.error("PUT /api/classes/[classId]/content/progress failed:", error);
    return NextResponse.json({ error: "PROGRESS_FAILED" }, { status: 500 });
  }
}
