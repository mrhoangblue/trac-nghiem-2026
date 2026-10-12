import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import HomeContent from "@/components/home/HomeContent";
import { GRADE_PAGES, gradeHref } from "@/lib/seo";
export const metadata: Metadata = { alternates: { canonical: "/" } };
export default async function Home({ searchParams }: { searchParams: Promise<{ grade?: string; type?: string }> }) {
  const { grade, type } = await searchParams;
  if (GRADE_PAGES.some((item) => item.grade === grade)) {
    permanentRedirect(`${gradeHref(grade!)}${type ? `?type=${encodeURIComponent(type)}` : ""}`);
  }
  return <HomeContent type={type} />;
}
