"use client";

import { usePathname } from "next/navigation";

/** Khung trang người học (đầu trang, menu, chân trang) không hiện trong khu quản trị hệ thống /system. */
export default function ChromeOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/system")) return null;
  return <>{children}</>;
}
