import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const [membershipSnapshot, legacyClassSnapshot] = await Promise.all([
      adminDb.collection("class_members").where("studentId", "==", authUser.uid).get(),
      adminDb.collection("classes").where("studentIds", "array-contains", authUser.uid).get(),
    ]);
    const memberships = await Promise.all(membershipSnapshot.docs.map(async (member) => {
      const data = member.data();
      const classSnapshot = await adminDb.collection("classes").doc(data.classId).get();
      if (!classSnapshot.exists) return null;
      const cls = classSnapshot.data() ?? {};
      return {
        id: classSnapshot.id,
        name: cls.name ?? "Lớp học",
        description: cls.description ?? "",
        teacherName: cls.teacherName ?? "Giáo viên",
        studentCount: Array.isArray(cls.studentIds) ? cls.studentIds.length : 0,
        isActive: cls.isActive === true,
        status: data.status ?? "pending",
        requestedAt: data.requestedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    }));

    const resolved = memberships.filter((item): item is NonNullable<typeof item> => item !== null);
    const knownIds = new Set(resolved.map((item) => item.id));
    for (const classDoc of legacyClassSnapshot.docs) {
      if (knownIds.has(classDoc.id)) continue;
      const cls = classDoc.data();
      resolved.push({
        id: classDoc.id,
        name: cls.name ?? "Lớp học",
        description: cls.description ?? "",
        teacherName: cls.teacherName ?? "Giáo viên",
        studentCount: Array.isArray(cls.studentIds) ? cls.studentIds.length : 0,
        isActive: cls.isActive === true,
        status: "active",
        requestedAt: null,
      });
    }

    return NextResponse.json({ memberships: resolved });
  } catch (error) {
    console.error("GET /api/classes/memberships failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
