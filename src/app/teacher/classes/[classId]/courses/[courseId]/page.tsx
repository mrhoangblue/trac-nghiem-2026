"use client";

import { useParams } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import ClassLearningContent from "@/components/classroom/ClassLearningContent";

export default function TeacherCoursePage() {
  const { classId, courseId } = useParams<{ classId: string; courseId: string }>();

  return (
    <AdminGuard>
      <main className="workspace-page mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7">
        <ClassLearningContent classId={classId} courseId={courseId} teacherMode />
      </main>
    </AdminGuard>
  );
}
