import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

async function authorizeTeacher(request: NextRequest, classId: string) {
  const authUser = await verifyAuth(request);
  if (!authUser) return { error: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  const classRef = adminDb.collection("classes").doc(classId);
  const classSnapshot = await classRef.get();
  if (!classSnapshot.exists) return { error: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  if (classSnapshot.data()?.teacherId !== authUser.uid && authUser.role !== "admin") {
    return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  return { authUser, classRef, classSnapshot };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params;
    const auth = await authorizeTeacher(request, classId);
    if (auth.error) return auth.error;
    const snapshot = await adminDb.collection("class_members").where("classId", "==", classId).get();
    const members = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        studentId: data.studentId,
        studentName: data.studentName ?? "Học sinh",
        studentEmail: data.studentEmail ?? "",
        status: data.status ?? "active",
        requestedAt: data.requestedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });
    return NextResponse.json({ members });
  } catch (error) {
    console.error("GET /api/classes/[classId]/members failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params;
    const auth = await authorizeTeacher(request, classId);
    if (auth.error || !auth.authUser || !auth.classRef) return auth.error;

    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const userSnapshot = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    if (userSnapshot.empty) {
      return NextResponse.json({ error: "STUDENT_NOT_FOUND" }, { status: 404 });
    }

    const studentDoc = userSnapshot.docs[0];
    const studentData = studentDoc.data();
    if (studentData.role !== "student") {
      return NextResponse.json({ error: "STUDENT_ONLY" }, { status: 409 });
    }

    const memberRef = adminDb.collection("class_members").doc(`${classId}_${studentDoc.id}`);
    const result = await adminDb.runTransaction(async (transaction) => {
      const [freshClass, existingMember] = await Promise.all([
        transaction.get(auth.classRef!),
        transaction.get(memberRef),
      ]);
      if (!freshClass.exists) return "NOT_FOUND" as const;

      const classData = freshClass.data() ?? {};
      const studentIds = Array.isArray(classData.studentIds) ? classData.studentIds : [];
      if (studentIds.includes(studentDoc.id) || existingMember.data()?.status === "active") {
        return "ALREADY_MEMBER" as const;
      }
      if (
        typeof classData.maxStudents === "number"
        && studentIds.length >= classData.maxStudents
      ) {
        return "FULL" as const;
      }

      transaction.update(auth.classRef!, {
        studentIds: FieldValue.arrayUnion(studentDoc.id),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(memberRef, {
        classId,
        studentId: studentDoc.id,
        studentName: studentData.fullName ?? "Học sinh",
        studentEmail: email,
        status: "active",
        joinedAt: FieldValue.serverTimestamp(),
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: auth.authUser!.uid,
      }, { merge: true });
      return "OK" as const;
    });

    if (result === "NOT_FOUND") return NextResponse.json({ error: result }, { status: 404 });
    if (result === "ALREADY_MEMBER" || result === "FULL") {
      return NextResponse.json({ error: result }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      student: {
        uid: studentDoc.id,
        fullName: String(studentData.fullName ?? "Học sinh"),
        email,
        school: typeof studentData.school === "string" ? studentData.school : "",
      },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/classes/[classId]/members failed:", error);
    return NextResponse.json({ error: "ADD_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params;
    const auth = await authorizeTeacher(request, classId);
    if (auth.error || !auth.authUser || !auth.classRef || !auth.classSnapshot) return auth.error;
    const body = (await request.json().catch(() => null)) as { studentId?: unknown; action?: unknown } | null;
    const studentId = typeof body?.studentId === "string" ? body.studentId : "";
    const action = body?.action;
    if (!studentId || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const memberRef = adminDb.collection("class_members").doc(`${classId}_${studentId}`);
    const result = await adminDb.runTransaction(async (transaction) => {
      const [freshClass, member] = await Promise.all([
        transaction.get(auth.classRef!),
        transaction.get(memberRef),
      ]);
      if (!member.exists || member.data()?.status !== "pending") return "NOT_PENDING" as const;
      const classData = freshClass.data() ?? {};
      const ids = Array.isArray(classData.studentIds) ? classData.studentIds : [];
      if (action === "approve") {
        if (typeof classData.maxStudents === "number" && ids.length >= classData.maxStudents) return "FULL" as const;
        transaction.update(auth.classRef!, {
          studentIds: FieldValue.arrayUnion(studentId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(memberRef, {
          status: "active",
          joinedAt: FieldValue.serverTimestamp(),
          reviewedAt: FieldValue.serverTimestamp(),
          reviewedBy: auth.authUser!.uid,
        });
      } else {
        transaction.update(memberRef, {
          status: "rejected",
          reviewedAt: FieldValue.serverTimestamp(),
          reviewedBy: auth.authUser!.uid,
        });
      }
      return "OK" as const;
    });

    if (result === "NOT_PENDING") return NextResponse.json({ error: result }, { status: 409 });
    if (result === "FULL") return NextResponse.json({ error: result }, { status: 409 });
    return NextResponse.json({ success: true, status: action === "approve" ? "active" : "rejected" });
  } catch (error) {
    console.error("PATCH /api/classes/[classId]/members failed:", error);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params;
    const auth = await authorizeTeacher(request, classId);
    if (auth.error || !auth.classRef) return auth.error;

    const body = (await request.json().catch(() => null)) as { studentId?: unknown } | null;
    const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
    if (!studentId) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const memberRef = adminDb.collection("class_members").doc(`${classId}_${studentId}`);
    await adminDb.runTransaction(async (transaction) => {
      const freshClass = await transaction.get(auth.classRef!);
      if (!freshClass.exists) throw new Error("CLASS_NOT_FOUND");
      transaction.update(auth.classRef!, {
        studentIds: FieldValue.arrayRemove(studentId),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.delete(memberRef);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "CLASS_NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("DELETE /api/classes/[classId]/members failed:", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }
}
