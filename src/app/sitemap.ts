import type { MetadataRoute } from "next";
import { GRADE_PAGES, SITE_URL } from "@/lib/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", ...GRADE_PAGES.map((page) => `/de-thi/${page.slug}`)].map((path) => ({ url: `${SITE_URL}${path || "/"}` }));
}
