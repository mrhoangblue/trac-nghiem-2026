"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ClassLearningContent from "@/components/classroom/ClassLearningContent";
import { useAuth } from "@/lib/AuthContext";

export default function StudentClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm font-semibold text-gray-500">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
        Đang kiểm tra tài khoản…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <div className="text-5xl">🔐</div>
        <h1 className="mt-4 text-2xl font-extrabold text-gray-900">Cần đăng nhập</h1>
        <p className="mt-2 text-gray-500">Vui lòng đăng nhập để xem khóa học và bài kiểm tra của lớp.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-brand-600 px-6 py-3 font-bold text-white">Về trang chủ</Link>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <Link href="/student/classes" className="mb-5 inline-flex text-sm font-bold text-brand-700 hover:underline">
        ← Lớp học của tôi
      </Link>
      <ClassLearningContent classId={classId} showClassHeader />
    </main>
  );
}
