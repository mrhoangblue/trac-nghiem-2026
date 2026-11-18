import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/systemAdmin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ email: auth.admin.email });
}
