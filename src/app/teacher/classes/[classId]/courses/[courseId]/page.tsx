"use client";

import { useParams } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import ClassLearningContent from "@/components/classroom/ClassLearningContent";

export default function TeacherCoursePage() {
  const { classId, courseId } = useParams<{ classId: string; courseId: string }>();

  return (
    <AdminGuard>
      <main className="workspace-page mx-auto w-full max-w-[1700px] px-3 py-4 sm:px-5 sm:py-6">
        <ClassLearningContent classId={classId} courseId={courseId} teacherMode />
      </main>
    </AdminGuard>
  );
}
