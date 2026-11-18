import { NextRequest, NextResponse } from "next/server";
import { buildOverview, loadPlatform } from "@/lib/systemMetrics";
import { requireSystemAdmin } from "@/lib/systemAdmin";

export const runtime = "nodejs";

/** Tổng quan toàn hệ thống: quy mô, tăng trưởng, hoạt động, phễu, giữ chân và việc cần xử lý. */
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(buildOverview(await loadPlatform()), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/system/overview failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
