"use client";

import Link from "next/link";
import { Presentation } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useStudentMode, useSwitchStudentMode } from "@/lib/StudentModeContext";
import StateIcon from "@/components/StateIcon";

/**
 * Bảo vệ các trang admin/mod.
 * - Admin (role=admin) và Giáo viên đã duyệt (role=mod) đều được phép.
 * - Nếu muốn chỉ cho admin, dùng prop adminOnly={true}.
 * - Khi giáo viên bật Chế độ học sinh, trang quản trị bị khóa như với học sinh.
 */
export default function AdminGuard({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { isAdmin, isMod, user } = useAuth();
  const { isStudentMode } = useStudentMode();
  const switchStudentMode = useSwitchStudentMode();

  const hasAccess = adminOnly ? isAdmin : isMod;

  if (hasAccess && isStudentMode) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-5 px-4 py-28 text-center">
        <StateIcon icon="lock" tone="muted" />
        <div>
          <h2 className="font-display text-2xl font-extrabold text-gray-900">Học sinh không vào được trang này</h2>
          <p className="mt-2 text-gray-500">Bạn đang ở Chế độ học sinh nên trang quản lý bị ẩn, giống hệt những gì học sinh thấy.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => switchStudentMode(false)} className="edu-btn inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white">
            <Presentation size={16} aria-hidden="true" />Quay lại chế độ giáo viên
          </button>
          <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-700">
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-5 px-4 py-28 text-center">
        <StateIcon icon="lock" />
        <div>
          <h2 className="font-display text-2xl font-extrabold text-gray-900">Không có quyền truy cập</h2>
          <p className="mt-2 text-gray-500">
            {!user
              ? "Vui lòng đăng nhập để tiếp tục."
              : adminOnly
              ? "Trang này chỉ dành cho quản trị viên."
              : "Trang này chỉ dành cho giáo viên và quản trị viên."}
          </p>
        </div>
        <Link href="/" className="edu-btn inline-flex h-11 items-center rounded-xl px-6 text-sm font-semibold text-white">
          Về trang chủ
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
