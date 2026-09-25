import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

const CLASS_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLASS_CODE_LENGTH = 6;

interface CreateClassBody {
  name?: unknown;
  description?: unknown;
  maxStudents?: unknown;
}

function randomClassCode(): string {
  let result = "";
  for (let index = 0; index < CLASS_CODE_LENGTH; index += 1) {
    result += CLASS_CODE_CHARS[Math.floor(Math.random() * CLASS_CODE_CHARS.length)];
  }
  return result;
}

async function generateUniqueClassCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomClassCode();
    const snapshot = await adminDb
      .collection("classes")
      .where("classCode", "==", code)
      .limit(1)
      .get();
    if (snapshot.empty) return code;
  }
  throw new Error("Could not generate a unique class code");
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (authUser.role !== "admin" && authUser.role !== "mod") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as CreateClassBody | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const maxStudents = body?.maxStudents;

    if (!name || name.length > 100 || description.length > 500) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    if (
      maxStudents !== undefined &&
      (!Number.isInteger(maxStudents) || (maxStudents as number) < 1 || (maxStudents as number) > 500)
    ) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const [classCode, profileSnapshot] = await Promise.all([
      generateUniqueClassCode(),
      adminDb.collection("users").doc(authUser.uid).get(),
    ]);
    const profile = profileSnapshot.data();
    const profileName = typeof profile?.fullName === "string" ? profile.fullName.trim() : "";
    const teacherName = profileName || authUser.email || "Giáo viên";

    const classRef = adminDb.collection("classes").doc();
    await classRef.set({
      classCode,
      name,
      description,
      teacherId: authUser.uid,
      teacherName,
      studentIds: [],
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(maxStudents !== undefined && { maxStudents }),
    });

    return NextResponse.json({ classId: classRef.id, classCode, name }, { status: 201 });
  } catch (error) {
    console.error("POST /api/classes failed:", error);
    return NextResponse.json({ error: "CREATE_FAILED" }, { status: 500 });
  }
}
