import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createR2UploadUrl, getR2Status } from "@/lib/r2Storage";
import { verifyAuth } from "@/lib/verifyAuth";

export const runtime = "nodejs";

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

    const body = await request.json() as {
      purpose?: "assignment" | "submission";
      assignmentId?: string;
      fileName?: string;
      size?: number;
    };
    const fileName = body.fileName?.trim() ?? "";
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const size = Number(body.size ?? 0);
    if (!fileName || !Number.isFinite(size) || size <= 0 || size > 25 * 1024 * 1024) {
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
    const signed = await createR2UploadUrl({
      fileName,
      contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
      folder: "learning-materials",
      metadata: {
        classId,
        uploadedBy: authUser.uid,
        purpose: body.purpose,
      },
    });
    return NextResponse.json({
      key: signed.key,
      uploadUrl: signed.uploadUrl,
      contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
    });
  } catch (error) {
    console.error("POST class activity upload failed:", error);
    return NextResponse.json({ error: "UPLOAD_PREPARE_FAILED" }, { status: 500 });
  }
}
