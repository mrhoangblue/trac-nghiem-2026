import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

interface JoinBody {
  classCode?: unknown;
  classId?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    if (authUser.role !== "student") {
      return NextResponse.json({ error: "STUDENT_ONLY" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as JoinBody | null;
    const classId = typeof body?.classId === "string" ? body.classId.trim() : "";
    const classCode = typeof body?.classCode === "string" ? body.classCode.trim().toUpperCase() : "";
    if (!classId && !/^[A-HJ-NP-Z2-9]{6}$/.test(classCode)) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const classSnapshot = classId
      ? await adminDb.collection("classes").doc(classId).get()
      : (await adminDb.collection("classes").where("classCode", "==", classCode).limit(1).get()).docs[0];
    if (!classSnapshot?.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const classData = classSnapshot.data() ?? {};
    if (!classData.isActive) return NextResponse.json({ error: "INACTIVE" }, { status: 409 });
    const studentIds = Array.isArray(classData.studentIds) ? classData.studentIds : [];
    if (studentIds.includes(authUser.uid)) {
      return NextResponse.json({ error: "ALREADY_JOINED" }, { status: 409 });
    }
    if (typeof classData.maxStudents === "number" && studentIds.length >= classData.maxStudents) {
      return NextResponse.json({ error: "FULL" }, { status: 409 });
    }

    const membershipRef = adminDb.collection("class_members").doc(`${classSnapshot.id}_${authUser.uid}`);
    const membershipSnapshot = await membershipRef.get();
    if (membershipSnapshot.data()?.status === "pending") {
      return NextResponse.json({ error: "ALREADY_PENDING" }, { status: 409 });
    }
    if (membershipSnapshot.data()?.status === "suspended") {
      return NextResponse.json({ error: "SUSPENDED" }, { status: 403 });
    }

    const profileSnapshot = await adminDb.collection("users").doc(authUser.uid).get();
    const profile = profileSnapshot.data() ?? {};
    await membershipRef.set({
      classId: classSnapshot.id,
      studentId: authUser.uid,
      studentName: typeof profile.fullName === "string" && profile.fullName.trim()
        ? profile.fullName.trim()
        : authUser.email || "Học sinh",
      studentEmail: authUser.email,
      status: "pending",
      requestedAt: FieldValue.serverTimestamp(),
      reviewedAt: FieldValue.delete(),
      reviewedBy: FieldValue.delete(),
    }, { merge: true });

    return NextResponse.json({
      success: true,
      status: "pending",
      classId: classSnapshot.id,
      className: classData.name ?? "Lớp học",
      teacherName: classData.teacherName ?? "Giáo viên",
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/classes/join failed:", error);
    return NextResponse.json({ error: "JOIN_FAILED" }, { status: 500 });
  }
}
