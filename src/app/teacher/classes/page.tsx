"use client";

import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import TeacherClassPanel from "@/components/classroom/TeacherClassPanel";

export default function TeacherClassesPage() {
  const { user, userProfile } = useAuth();

  return (
    <AdminGuard>
      <div className="workspace-page max-w-5xl mx-auto px-4 py-8 sm:py-10 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Quản lý lớp học</h1>
          <p className="text-gray-500 mt-1">Tạo và quản lý lớp học của bạn. Chia sẻ mã lớp để học sinh tham gia.</p>
        </div>

        {user && userProfile && (
          <TeacherClassPanel />
        )}
      </div>
    </AdminGuard>
  );
}
