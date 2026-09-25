import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

const DELETE_BATCH_SIZE = 450;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { classId } = await params;
    const classRef = adminDb.collection("classes").doc(classId);
    const classSnapshot = await classRef.get();

    if (!classSnapshot.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const classData = classSnapshot.data();
    const ownsClass = classData?.teacherId === authUser.uid;
    if (!ownsClass && authUser.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const [membersSnapshot, coursesSnapshot] = await Promise.all([
      adminDb.collection("class_members").where("classId", "==", classId).get(),
      adminDb.collection("class_courses").where("classId", "==", classId).get(),
    ]);

    const dependentDocuments = [...membersSnapshot.docs, ...coursesSnapshot.docs];
    for (let offset = 0; offset < dependentDocuments.length; offset += DELETE_BATCH_SIZE) {
      const batch = adminDb.batch();
      dependentDocuments
        .slice(offset, offset + DELETE_BATCH_SIZE)
        .forEach((member) => batch.delete(member.ref));
      await batch.commit();
    }

    const finalBatch = adminDb.batch();
    finalBatch.delete(classRef);

    if (typeof classData?.groupId === "string" && classData.groupId) {
      const groupRef = adminDb.collection("class_groups").doc(classData.groupId);
      const groupSnapshot = await groupRef.get();
      if (groupSnapshot.exists) {
        finalBatch.update(groupRef, {
          classIds: FieldValue.arrayRemove(classId),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await finalBatch.commit();
    return NextResponse.json({
      success: true,
      deletedMembers: membersSnapshot.size,
      deletedCourses: coursesSnapshot.size,
    });
  } catch (error) {
    console.error("DELETE /api/classes/[classId] failed:", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }
}
