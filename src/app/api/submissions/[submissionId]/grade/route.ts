import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { loadSubmissionForUser } from "@/lib/essaySubmission";
import { verifyAuth } from "@/lib/verifyAuth";
import { essayQuestionPoints } from "@/utils/examStructure";
import type { EssayAnnotations } from "@/utils/essayTypes";

export const runtime = "nodejs";

const MAX_ANNOTATION_BYTES = 900 * 1024;

interface GradeBody {
  essayScores?: Record<string, unknown>;
  essayComments?: Record<string, unknown>;
  generalComment?: unknown;
  annotations?: unknown;
  /** true: công bố điểm cho học sinh; false: lưu nháp. */
  final?: boolean;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Giáo viên tác giả đề hoặc admin lưu phiếu chấm và nét chấm Phần IV. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser?.email) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const { submissionId } = await params;
    const loaded = await loadSubmissionForUser(submissionId, authUser);
    if (!loaded?.isGrader) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { ref, data, exam } = loaded;
    if (data.status !== "COMPLETED" || (data.gradingStatus !== "pending" && data.gradingStatus !== "graded")) {
      return NextResponse.json({ error: "NOT_GRADABLE" }, { status: 409 });
    }

    const body = await request.json().catch(() => ({})) as GradeBody;
    const questions = Array.isArray(exam.questions) ? exam.questions as Array<{ id: number; type: string; points?: number }> : [];
    const maxPoints = essayQuestionPoints(questions, Number(exam.scoringConfig?.part4TotalScore ?? 0));

    const essayScores: Record<string, number> = {};
    const essayComments: Record<string, string> = {};
    for (const [questionId, max] of maxPoints) {
      const key = String(questionId);
      const raw = body.essayScores?.[key];
      if (raw !== undefined && raw !== null && raw !== "") {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > max + 1e-9) {
          return NextResponse.json({ error: "SCORE_OUT_OF_RANGE", questionId, max }, { status: 400 });
        }
        essayScores[key] = round(value);
      }
      const comment = body.essayComments?.[key];
      if (typeof comment === "string" && comment.trim()) essayComments[key] = comment.trim().slice(0, 2000);
    }
    if (body.final && Object.keys(essayScores).length < maxPoints.size) {
      return NextResponse.json({ error: "SCORES_INCOMPLETE" }, { status: 400 });
    }

    const annotations = (body.annotations && typeof body.annotations === "object" ? body.annotations : {}) as EssayAnnotations;
    if (Buffer.byteLength(JSON.stringify(annotations), "utf8") > MAX_ANNOTATION_BYTES) {
      return NextResponse.json({ error: "ANNOTATIONS_TOO_LARGE" }, { status: 413 });
    }

    const p4 = round(Object.values(essayScores).reduce((sum, value) => sum + value, 0));
    const scores = (data.scores ?? {}) as Record<string, unknown>;
    const autoTotal = Number(scores.p1 ?? 0) + Number(scores.p2 ?? 0) + Number(scores.p3 ?? 0);
    const grading = {
      essayScores,
      essayComments,
      generalComment: typeof body.generalComment === "string" ? body.generalComment.trim().slice(0, 4000) : "",
      gradedBy: authUser.email,
      gradedAt: FieldValue.serverTimestamp(),
    };

    const batch = adminDb.batch();
    batch.set(adminDb.collection("essay_annotations").doc(submissionId), {
      submissionId,
      examId: data.examId,
      pages: annotations,
      updatedBy: authUser.email,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.update(ref, {
      grading,
      ...(body.final ? {
        gradingStatus: "graded",
        "scores.p4": p4,
        "scores.total": round(autoTotal + p4),
        // Chấm xong thì khóa luôn việc thêm/xóa ảnh.
        ...(data.essay?.finalizedAt ? {} : { "essay.finalizedAt": FieldValue.serverTimestamp() }),
      } : {}),
    });
    await batch.commit();

    return NextResponse.json({ success: true, p4, total: round(autoTotal + p4), gradingStatus: body.final ? "graded" : data.gradingStatus });
  } catch (error) {
    console.error("PUT grade failed:", error);
    return NextResponse.json({ error: "GRADE_SAVE_FAILED" }, { status: 500 });
  }
}
