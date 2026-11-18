import { NextRequest, NextResponse } from "next/server";
import { buildRisks, loadPlatform } from "@/lib/systemMetrics";
import { requireSystemAdmin } from "@/lib/systemAdmin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(buildRisks(await loadPlatform()), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/system/risks failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
