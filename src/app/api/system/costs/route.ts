import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { millis, requireSystemAdmin, vnDay } from "@/lib/systemAdmin";

export const runtime = "nodejs";

interface TeacherCost { email: string; aiCalls: number; inputTokens: number; outputTokens: number; storageBytes: number; files: number }

/**
 * Chi phí tài nguyên theo giáo viên: lượt và token chấm AI (từ kết quả đã lưu) và dung lượng ảnh bài làm tự luận.
 * Chỉ trả số đo; đơn giá do quản trị nhập trên màn hình để không ghi cứng giá của nhà cung cấp.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const [ai, exams, submissions] = await Promise.all([
      adminDb.collection("essay_ai_grading").select("examId", "requestedBy", "result").get(),
      adminDb.collection("exams").select("authorEmail").get(),
      adminDb.collection("submissions").select("examId", "essay").get(),
    ]);
    const authorByExam = new Map<string, string>();
    exams.docs.forEach((item) => authorByExam.set(item.id, String(item.get("authorEmail") ?? "").toLowerCase()));
    const teachers = new Map<string, TeacherCost>();
    const entry = (email: string) => {
      const key = email || "(không rõ)";
      let current = teachers.get(key);
      if (!current) { current = { email: key, aiCalls: 0, inputTokens: 0, outputTokens: 0, storageBytes: 0, files: 0 }; teachers.set(key, current); }
      return current;
    };

    const byDay = new Map<string, { day: string; calls: number; tokens: number }>();
    const models = new Map<string, { model: string; calls: number; inputTokens: number; outputTokens: number }>();
    ai.docs.forEach((item) => {
      const result = item.get("result") as { usage?: { inputTokens?: number; outputTokens?: number } | null; model?: string; gradedAtMillis?: number } | undefined;
      if (!result) return;
      const input = Number(result.usage?.inputTokens ?? 0);
      const output = Number(result.usage?.outputTokens ?? 0);
      const owner = entry(authorByExam.get(String(item.get("examId") ?? "")) ?? "");
      owner.aiCalls += 1; owner.inputTokens += input; owner.outputTokens += output;
      const day = vnDay(Number(result.gradedAtMillis ?? millis(item.updateTime) ?? Date.now()));
      const bucket = byDay.get(day) ?? { day, calls: 0, tokens: 0 };
      bucket.calls += 1; bucket.tokens += input + output;
      byDay.set(day, bucket);
      const modelName = String(result.model ?? "không rõ");
      const model = models.get(modelName) ?? { model: modelName, calls: 0, inputTokens: 0, outputTokens: 0 };
      model.calls += 1; model.inputTokens += input; model.outputTokens += output;
      models.set(modelName, model);
    });

    let storageBytes = 0;
    let files = 0;
    submissions.docs.forEach((item) => {
      const list = (item.get("essay") as { files?: Array<{ size?: number }> } | undefined)?.files;
      if (!Array.isArray(list)) return;
      const owner = entry(authorByExam.get(String(item.get("examId") ?? "")) ?? "");
      list.forEach((file) => {
        const size = Number(file?.size ?? 0);
        owner.storageBytes += size; owner.files += 1; storageBytes += size; files += 1;
      });
    });

    const rows = [...teachers.values()];
    return NextResponse.json({
      totals: {
        aiCalls: rows.reduce((sum, row) => sum + row.aiCalls, 0),
        inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
        outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
        storageBytes, files,
      },
      teachers: rows.sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens) || b.storageBytes - a.storageBytes),
      models: [...models.values()],
      byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/system/costs failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
