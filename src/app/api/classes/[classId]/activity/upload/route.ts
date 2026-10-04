import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createR2UploadUrl, getR2Status, uploadToR2 } from "@/lib/r2Storage";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const VERCEL_SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const { classId } = await params;
    const authUser = await verifyAuth(request);
    if (!authUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const classSnapshot = await adminDb.collection("classes").doc(classId).get();
    if (!classSnapshot.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const classData = classSnapshot.data() ?? {};
    const isTeacher = classData.teacherId === authUser.uid || authUser.role === "admin";
    const isStudent = Array.isArray(classData.studentIds) && classData.studentIds.includes(authUser.uid);
    if (!isTeacher && !isStudent) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const requestContentType = request.headers.get("content-type") ?? "";
    const isMultipart = requestContentType.includes("multipart/form-data");
    let body: {
      purpose?: "assignment" | "submission";
      assignmentId?: string;
      fileName?: string;
      size?: number;
    };
    let uploadedFile: File | null = null;

    if (isMultipart) {
      const formData = await request.formData();
      const candidate = formData.get("file");
      uploadedFile = candidate instanceof File ? candidate : null;
      body = {
        purpose: String(formData.get("purpose") ?? "") as "assignment" | "submission",
        assignmentId: String(formData.get("assignmentId") ?? "") || undefined,
        fileName: uploadedFile?.name,
        size: uploadedFile?.size,
      };
    } else {
      body = await request.json() as typeof body;
    }
    const fileName = body.fileName?.trim() ?? "";
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const size = Number(body.size ?? 0);
    if (!fileName || !Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "FILE_SIZE_INVALID" }, { status: 413 });
    }
    if (body.purpose === "assignment") {
      if (!isTeacher) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      if (extension !== "pdf") return NextResponse.json({ error: "PDF_REQUIRED" }, { status: 415 });
    } else if (body.purpose === "submission") {
      if (!isStudent || !body.assignmentId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      if (!["pdf", "png", "jpg", "jpeg", "webp"].includes(extension)) {
        return NextResponse.json({ error: "FILE_TYPE_UNSUPPORTED" }, { status: 415 });
      }
      const assignmentSnapshot = await adminDb.collection("class_assignments").doc(body.assignmentId).get();
      const assignment = assignmentSnapshot.data();
      const dueAt = assignment?.dueAt?.toDate?.() as Date | undefined;
      if (!assignmentSnapshot.exists || assignment?.classId !== classId) {
        return NextResponse.json({ error: "ASSIGNMENT_NOT_FOUND" }, { status: 404 });
      }
      if (assignment?.acceptingSubmissions === false || (dueAt && dueAt.getTime() < Date.now())) {
        return NextResponse.json({ error: "ASSIGNMENT_CLOSED" }, { status: 409 });
      }
    } else {
      return NextResponse.json({ error: "INVALID_PURPOSE" }, { status: 400 });
    }

    const r2 = getR2Status();
    if (!r2.configured) return NextResponse.json({ error: "R2_NOT_READY" }, { status: 503 });
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
    const metadata = {
      classId,
      uploadedBy: authUser.uid,
      purpose: body.purpose,
    };

    if (uploadedFile) {
      const serverLimit = process.env.VERCEL ? VERCEL_SERVER_UPLOAD_LIMIT : MAX_FILE_SIZE;
      if (uploadedFile.size > serverLimit) {
        return NextResponse.json({ error: "DIRECT_UPLOAD_REQUIRED", serverUploadLimit: serverLimit }, { status: 413 });
      }
      const uploaded = await uploadToR2({
        body: new Uint8Array(await uploadedFile.arrayBuffer()),
        contentType,
        fileName,
        folder: "learning-materials",
        metadata: { ...metadata, uploadMode: "server-fallback" },
      });
      return NextResponse.json({
        key: uploaded.key,
        contentType,
        size: uploadedFile.size,
        uploadMode: "server-fallback",
      });
    }

    const signed = await createR2UploadUrl({
      fileName,
      contentType,
      folder: "learning-materials",
      metadata,
    });
    return NextResponse.json({
      key: signed.key,
      uploadUrl: signed.uploadUrl,
      contentType,
      serverFallbackMaxBytes: process.env.VERCEL ? VERCEL_SERVER_UPLOAD_LIMIT : MAX_FILE_SIZE,
    });
  } catch (error) {
    console.error("POST class activity upload failed:", error);
    return NextResponse.json({ error: "UPLOAD_PREPARE_FAILED" }, { status: 500 });
  }
}
