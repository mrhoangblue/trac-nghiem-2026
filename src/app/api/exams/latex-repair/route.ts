import { NextRequest, NextResponse } from "next/server";
import { LatexRepairError, repairLatexBlocks, type RepairRequestBlock } from "@/lib/aiLatexRepair";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BLOCKS = 40;
const MAX_BLOCK_CHARS = 20_000;
const MAX_TOTAL_CHARS = 200_000;

/** Giáo viên nhờ AI viết lại các câu có LaTeX chưa chuẩn. Không ghi gì vào cơ sở dữ liệu. */
export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser || !["admin", "mod"].includes(authUser.role)) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as { blocks?: unknown } | null;
    if (!body || !Array.isArray(body.blocks) || body.blocks.length === 0 || body.blocks.length > MAX_BLOCKS) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const blocks: RepairRequestBlock[] = [];
    let total = 0;
    for (const item of body.blocks as Array<Record<string, unknown>>) {
      const latex = typeof item?.latex === "string" ? item.latex : "";
      const index = Number(item?.index);
      if (!Number.isInteger(index) || !latex.trim() || latex.length > MAX_BLOCK_CHARS) {
        return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
      }
      total += latex.length;
      const issues = Array.isArray(item.issues) ? item.issues.filter((issue): issue is string => typeof issue === "string").map((issue) => issue.slice(0, 300)).slice(0, 12) : [];
      blocks.push({ index, latex, issues });
    }
    if (total > MAX_TOTAL_CHARS) return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });

    const results = await repairLatexBlocks(blocks);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof LatexRepairError) {
      const status = error.code === "RATE_LIMITED" ? 429 : error.code === "AI_NOT_CONFIGURED" ? 503 : 502;
      if (error.code !== "RATE_LIMITED" && error.code !== "AI_NOT_CONFIGURED") console.error("POST latex-repair failed:", error.message);
      return NextResponse.json({ error: error.code }, { status });
    }
    console.error("POST latex-repair failed:", error);
    return NextResponse.json({ error: "REPAIR_FAILED" }, { status: 500 });
  }
}
