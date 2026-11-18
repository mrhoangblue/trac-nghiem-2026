import type { Metadata } from "next";
import SystemShell from "@/components/system/SystemShell";

export const metadata: Metadata = { title: "Quản trị hệ thống", robots: { index: false, follow: false } };

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return <SystemShell>{children}</SystemShell>;
}
