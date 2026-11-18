import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { millis, requireSystemAdmin } from "@/lib/systemAdmin";

export const runtime = "nodejs";

/** 200 thao tác quản trị gần nhất. */
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const snapshot = await adminDb.collection("admin_audit_logs").orderBy("createdAt", "desc").limit(200).get();
    return NextResponse.json({
      logs: snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id, action: String(data.action ?? ""), targetType: String(data.targetType ?? ""), targetId: String(data.targetId ?? ""),
          targetLabel: String(data.targetLabel ?? ""), adminEmail: String(data.adminEmail ?? ""), detail: data.detail ?? {}, atMillis: millis(data.createdAt),
        };
      }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/system/audit failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
