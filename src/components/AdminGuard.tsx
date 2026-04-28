"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

/**
 * Bảo vệ các trang admin/mod.
 * - Admin (role=admin) và Giáo viên đã duyệt (role=mod) đều được phép.
 * - Nếu muốn chỉ cho admin, dùng prop adminOnly={true}.
 */
export default function AdminGuard({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { isAdmin, isMod, user } = useAuth();

  const hasAccess = adminOnly ? isAdmin : isMod;

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6 text-center px-4">
        <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center text-4xl shadow-sm">
          🔒
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 mb-2">Không có quyền truy cập</h2>
          <p className="text-gray-500 max-w-sm">
            {!user
              ? "Vui lòng đăng nhập để tiếp tục."
              : adminOnly
              ? "Trang này chỉ dành cho quản trị viên."
              : "Trang này chỉ dành cho giáo viên và quản trị viên."}
          </p>
        </div>
        <Link
          href="/"
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
        >
          Về trang chủ
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
