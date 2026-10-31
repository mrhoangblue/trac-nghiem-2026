import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";

/**
 * Thu hồi mọi phiên đăng nhập của chính tài khoản. Thiết bị khác bị đăng xuất
 * khi phiên hiện tại của chúng cần làm mới (chậm nhất khoảng 1 giờ).
 */
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.uid) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    await adminAuth.revokeRefreshTokens(authUser.uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/profile/sessions failed:", error);
    return NextResponse.json({ error: "REVOKE_FAILED" }, { status: 500 });
  }
}
