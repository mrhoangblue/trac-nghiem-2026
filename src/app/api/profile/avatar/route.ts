import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { deleteFromR2, getR2Status, uploadToR2 } from "@/lib/r2Storage";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

async function removeStoredAvatar(key: unknown) {
  if (typeof key !== "string" || !key.startsWith("avatars/")) return;
  await deleteFromR2(key).catch((error) => console.error("Delete old avatar failed:", error));
}

/** Ảnh đại diện đã được thu nhỏ ở trình duyệt (256×256) nên gửi thẳng qua máy chủ. */
export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.uid) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const status = getR2Status();
    if (!status.configured || !status.publicAccessConfigured) {
      return NextResponse.json({ error: "R2_NOT_READY" }, { status: 503 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    const extension = AVATAR_TYPES[file.type];
    if (!extension) return NextResponse.json({ error: "FILE_TYPE_UNSUPPORTED" }, { status: 415 });
    if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) return NextResponse.json({ error: "FILE_SIZE_INVALID" }, { status: 413 });

    const uploaded = await uploadToR2({
      body: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      fileName: `${authUser.uid}.${extension}`,
      folder: "avatars",
    });
    if (!uploaded.url) return NextResponse.json({ error: "R2_NOT_READY" }, { status: 503 });

    const userRef = adminDb.collection("users").doc(authUser.uid);
    const previousKey = (await userRef.get()).data()?.avatarKey;
    await userRef.set({ avatarUrl: uploaded.url, avatarKey: uploaded.key, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await removeStoredAvatar(previousKey);
    return NextResponse.json({ avatarUrl: uploaded.url });
  } catch (error) {
    console.error("POST /api/profile/avatar failed:", error);
    return NextResponse.json({ error: "UPLOAD_FAILED" }, { status: 500 });
  }
}

/** Gỡ ảnh tự tải lên, quay về ảnh tài khoản Google. */
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.uid) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const userRef = adminDb.collection("users").doc(authUser.uid);
    const previousKey = (await userRef.get()).data()?.avatarKey;
    await userRef.set({ avatarUrl: FieldValue.delete(), avatarKey: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await removeStoredAvatar(previousKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/profile/avatar failed:", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }
}
