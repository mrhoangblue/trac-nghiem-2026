import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomeContent from "@/components/home/HomeContent";
import { GRADE_PAGES } from "@/lib/seo";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> };
export function generateStaticParams() { return GRADE_PAGES.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = GRADE_PAGES.find((item) => item.slug === slug);
  if (!page) notFound();
  return { title: page.title, description: page.description, alternates: { canonical: `/de-thi/${slug}` }, openGraph: { title: page.title, description: page.description, url: `/de-thi/${slug}`, locale: "vi_VN", type: "website" } };
}
export default async function GradePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = GRADE_PAGES.find((item) => item.slug === slug);
  if (!page) notFound();
  return <HomeContent grade={page.grade} type={(await searchParams).type} heading={page.title} description={page.description} />;
}
