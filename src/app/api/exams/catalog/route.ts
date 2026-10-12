import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";

// List cards never need question text, answer keys, LaTeX or R2 source files.
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const isTeacher = user.role === "admin" || user.role === "mod";
    const [snapshot, classes] = await Promise.all([
      adminDb.collection("exams").select("title", "description", "questionCount", "gradeLevel", "examType", "coverImageUrl", "duration", "requiresPassword", "targetType", "targetClassIds").get(),
      isTeacher ? Promise.resolve(null) : adminDb.collection("classes").where("studentIds", "array-contains", user.uid).select().get(),
    ]);
    const classIds = new Set(classes?.docs.map((item) => item.id) ?? []);
    const visible = snapshot.docs.filter((item) => {
      const data = item.data();
      const targets = Array.isArray(data.targetClassIds) ? data.targetClassIds : [];
      return isTeacher || data.targetType !== "classes" || targets.length === 0 || targets.some((id: string) => classIds.has(id));
    });
    const exams = await Promise.all(visible.map(async (item) => {
      const data = item.data();
      let questionCount = Number(data.questionCount);
      // Older documents predate the summary field; retain their displayed count.
      if (!Number.isFinite(questionCount)) {
        const legacy = (await item.ref.get()).data();
        questionCount = Array.isArray(legacy?.questions) ? legacy.questions.length : 0;
      }
      return {
        id: item.id, title: String(data.title ?? "Bài thi không có tên"),
        description: String(data.description ?? ""), questionCount,
        gradeLevel: data.gradeLevel ?? null, examType: data.examType ?? null,
        coverImageUrl: data.coverImageUrl ?? null, duration: Number(data.duration ?? 90),
        requiresPassword: Boolean(data.requiresPassword),
      };
    }));
    return NextResponse.json({ exams }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET exam catalog failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
