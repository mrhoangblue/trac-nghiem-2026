"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ClassLearningContent from "@/components/classroom/ClassLearningContent";
import { useAuth } from "@/lib/AuthContext";

export default function StudentCoursePage() {
  const { classId, courseId } = useParams<{ classId: string; courseId: string }>();
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="py-24 text-center text-sm font-semibold text-gray-500">Đang mở khóa học…</div>;
  }
  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold text-gray-900">Cần đăng nhập</h1>
        <p className="mt-2 text-gray-500">Vui lòng đăng nhập để tiếp tục khóa học.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-brand-600 px-6 py-3 font-bold text-white">Về trang chủ</Link>
      </main>
    );
  }

  return (
    <main className="workspace-page mx-auto w-full max-w-[1700px] px-3 py-4 sm:px-5 sm:py-6">
      <ClassLearningContent classId={classId} courseId={courseId} />
    </main>
  );
}
