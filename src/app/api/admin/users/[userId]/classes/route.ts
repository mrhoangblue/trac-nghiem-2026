import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    if (authUser.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const { userId } = await params;
    const userSnapshot = await adminDb.collection("users").doc(userId).get();
    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const userData = userSnapshot.data() ?? {};
    if (userData.role !== "admin" && userData.role !== "mod") {
      return NextResponse.json({ error: "NOT_TEACHER" }, { status: 400 });
    }

    const classSnapshot = await adminDb
      .collection("classes")
      .where("teacherId", "==", userId)
      .get();

    const classes = await Promise.all(classSnapshot.docs.map(async (classDocument) => {
      const classData = classDocument.data();
      const courseSnapshot = await adminDb
        .collection("class_courses")
        .where("classId", "==", classDocument.id)
        .get();

      const courses = courseSnapshot.docs.map((courseDocument) => {
        const courseData = courseDocument.data();
        const lessons = Array.isArray(courseData.lessons) ? courseData.lessons : [];
        return {
          id: courseDocument.id,
          title: String(courseData.title ?? "Khóa học chưa đặt tên"),
          description: String(courseData.description ?? ""),
          published: Boolean(courseData.published),
          createdAt: toIso(courseData.createdAt),
          lessons: lessons.map((lesson: Record<string, unknown>) => ({
            id: String(lesson.id ?? ""),
            title: String(lesson.title ?? "Bài học chưa đặt tên"),
            description: String(lesson.description ?? ""),
            resourceCount: Array.isArray(lesson.resources) ? lesson.resources.length : 0,
          })),
        };
      });
      courses.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

      return {
        id: classDocument.id,
        name: String(classData.name ?? "Lớp học"),
        description: String(classData.description ?? ""),
        isActive: classData.isActive !== false,
        studentCount: Array.isArray(classData.studentIds) ? classData.studentIds.length : 0,
        createdAt: toIso(classData.createdAt),
        courses,
      };
    }));
    classes.sort((a, b) => a.name.localeCompare(b.name, "vi"));

    return NextResponse.json({
      teacher: {
        uid: userSnapshot.id,
        fullName: String(userData.fullName ?? userData.email ?? "Giáo viên"),
        email: String(userData.email ?? ""),
        school: String(userData.school ?? ""),
        role: String(userData.role),
      },
      classes,
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("GET /api/admin/users/[userId]/classes failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
