import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/verifyAuth";
import { getR2Status } from "@/lib/r2Storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authUser = await verifyAuth(request);
  if (!authUser || !["admin", "mod"].includes(authUser.role)) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  return NextResponse.json(getR2Status());
}
