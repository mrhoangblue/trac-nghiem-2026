"use client";

import Link from "next/link";
import { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import ExplanationRenderer from "@/components/ExplanationRenderer";
import TikzRenderer from "@/components/TikzRenderer";
import { ScoreResult, normalizeAnswer, P2_TABLE, formatDS, cleanPart3Answer } from "@/utils/examTypes";
import { SECTION_META } from "@/components/QuizClient";

interface ReviewModeProps {
  title: string;
  questions: ParsedQuestion[];
  p1Ans: Record<number, number>;
  p2Ans: Record<number, (boolean | null)[]>;
  p3Ans: Record<number, string>;
  scoreResult: ScoreResult;
  /** Nếu true, ẩn nút "Về trang chủ" (dùng trong trang review độc lập) */
  standalone?: boolean;
}

export default function ReviewMode({
  title,
  questions,
  p1Ans,
  p2Ans,
  p3Ans,
  scoreResult,
  standalone = false,
}: ReviewModeProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 w-full">
      {/* ── Score banner ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 text-white text-center mb-8 shadow-lg">
        <p className="text-sm opacity-70 mb-1 font-medium">{title}</p>
        <p className="text-7xl font-extrabold tracking-tight">
          {scoreResult.total}
          <span className="text-3xl opacity-50 ml-1">/10</span>
        </p>

        <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
          {/* P1 */}
          <div className="bg-white/10 rounded-2xl px-3 py-3">
            <p className="opacity-70 text-xs font-semibold uppercase tracking-wide mb-1">
              Phần 1
            </p>
            <p className="text-2xl font-extrabold">
              {scoreResult.p1}
              <span className="text-sm opacity-60">đ</span>
            </p>
            {scoreResult.part1 && (
              <p className="opacity-70 text-xs mt-0.5">
                {scoreResult.part1.correct}/{scoreResult.part1.total} câu đúng
              </p>
            )}
          </div>

          {/* P2 */}
          <div className="bg-white/10 rounded-2xl px-3 py-3">
            <p className="opacity-70 text-xs font-semibold uppercase tracking-wide mb-1">
              Phần 2
            </p>
            <p className="text-2xl font-extrabold">
              {scoreResult.p2}
              <span className="text-sm opacity-60">đ</span>
            </p>
            {scoreResult.part2?.details && (
              <div className="opacity-70 text-xs mt-0.5 flex flex-col gap-0.5">
                {scoreResult.part2.details.map((d, i) => (
                  <span key={i}>
                    C{i + 1}: {d.match}/{d.maxMatch} ý ({d.score}đ)
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* P3 */}
          <div className="bg-white/10 rounded-2xl px-3 py-3">
            <p className="opacity-70 text-xs font-semibold uppercase tracking-wide mb-1">
              Phần 3
            </p>
            <p className="text-2xl font-extrabold">
              {scoreResult.p3}
              <span className="text-sm opacity-60">đ</span>
            </p>
            {scoreResult.part3 && (
              <p className="opacity-70 text-xs mt-0.5">
                {scoreResult.part3.correct}/{scoreResult.part3.total} câu đúng
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Per-question review ───────────────────────────────────────────── */}
      <div className="space-y-5">
        {questions.map((q, idx) => {
          // Section divider khi bắt đầu nhóm câu mới
          const prevType = idx > 0 ? questions[idx - 1].type : null;
          const isFirstOfSection = idx === 0 || prevType !== q.type;
          const sectionMeta = SECTION_META[q.type];
          let isCorrect = false;

          // ── P2-specific precomputed values ────────────────────────────────
          let p2Hits = 0;
          let p2Score = 0;
          let p2StudentDS = "";
          let p2CorrectDS = "";

          if (q.type === "multiple_choice") {
            isCorrect = p1Ans[q.id] === (q.correctAnswer as number);
          } else if (q.type === "true_false") {
            const correct = q.correctAnswer as boolean[];
            const student = p2Ans[q.id] ?? new Array(correct.length).fill(null);
            p2Hits = correct.filter((c, i) => c === student[i]).length;
            p2Score = P2_TABLE[p2Hits] ?? 0;
            p2StudentDS = formatDS(student, correct.length);
            p2CorrectDS = correct.map((b) => (b ? "Đ" : "S")).join("");
            isCorrect = p2Hits === correct.length;
          } else if (q.type === "short_answer") {
            const student = normalizeAnswer(p3Ans[q.id] ?? "");
            const correct = normalizeAnswer(String(q.correctAnswer ?? ""));
            isCorrect = student !== "" && student === correct;
          }

          return (
            <div key={q.id}>
              {/* Section header divider */}
              {isFirstOfSection && sectionMeta && (
                <div className={`mb-4 px-5 py-3 rounded-2xl border-2 ${sectionMeta.colors}`}>
                  <p className="font-extrabold text-sm">
                    PHẦN {sectionMeta.roman}: {sectionMeta.label}
                  </p>
                  <p className="text-xs opacity-80 mt-0.5">{sectionMeta.note}</p>
                </div>
              )}
            <div
              className={`rounded-2xl border-2 p-6 ${
                isCorrect
                  ? "border-green-400 bg-green-50/40"
                  : "border-red-300 bg-red-50/40"
              }`}
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-sm flex-shrink-0 ${
                    isCorrect ? "bg-green-500 text-white" : "bg-red-400 text-white"
                  }`}
                >
                  {idx + 1}
                </span>
                <div className="flex-1 text-gray-900 font-medium leading-relaxed">
                  {processLatexText(q.questionText)}
                </div>
              </div>

              {/* Question TikZ */}
              {q.tikzCode && (
                <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4 flex justify-center">
                  <TikzRenderer code={q.tikzCode} />
                </div>
              )}

              {/* ── P1 review ────────────────────────────────────────────── */}
              {q.type === "multiple_choice" && q.options && (
                <div className="grid gap-2 mb-4">
                  {q.options.map((opt, i) => {
                    const isStudentPick = p1Ans[q.id] === i;
                    const isCorrectAns = (q.correctAnswer as number) === i;
                    return (
                      <div
                        key={i}
                        className={`p-3 rounded-xl border flex items-center gap-2 text-sm ${
                          isCorrectAns
                            ? "border-green-400 bg-green-100 text-green-900"
                            : isStudentPick
                            ? "border-red-300 bg-red-100 text-red-900"
                            : "border-gray-200 bg-white text-gray-600"
                        }`}
                      >
                        <span className="font-bold shrink-0">
                          {String.fromCharCode(65 + i)}.
                        </span>
                        <span className="flex-1">{processLatexText(opt)}</span>
                        {isCorrectAns && (
                          <span className="ml-auto font-bold text-green-600 shrink-0">
                            ✓ Đúng
                          </span>
                        )}
                        {isStudentPick && !isCorrectAns && (
                          <span className="ml-auto font-bold text-red-500 shrink-0">
                            ✗ Sai
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── P2 review ────────────────────────────────────────────── */}
              {q.type === "true_false" && q.options && (
                <div className="mb-4">
                  {/* Bảng phát biểu — chỉ giữ cột ý + nội dung + lựa chọn của HS */}
                  <div className="overflow-x-auto rounded-xl border border-amber-200 mb-3">
                    <table className="w-full border-collapse text-sm">
                      <tbody>
                        {q.options.map((stmt, i) => {
                          const studentVal = (p2Ans[q.id] ?? [])[i];
                          const correctVal = (q.correctAnswer as boolean[])[i];
                          const answered = studentVal !== null && studentVal !== undefined;
                          const isMatch = answered && studentVal === correctVal;

                          return (
                            <tr
                              key={i}
                              className={`border-t border-amber-100 ${
                                !answered
                                  ? i % 2 === 1 ? "bg-amber-50/20" : "bg-white"
                                  : isMatch
                                  ? "bg-green-50/50"
                                  : "bg-red-50/50"
                              }`}
                            >
                              <td className="px-3 py-2.5 text-center font-extrabold text-amber-600 border-r border-amber-100 w-8 shrink-0">
                                {String.fromCharCode(97 + i)}
                              </td>
                              <td className="px-4 py-2.5 text-gray-800 leading-relaxed">
                                {processLatexText(stmt)}
                              </td>
                              {/* Badge EM chọn */}
                              <td className="px-3 py-2.5 text-center border-l border-amber-100 w-12 shrink-0">
                                <span
                                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    !answered
                                      ? "bg-gray-100 text-gray-400"
                                      : studentVal
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-sky-100 text-sky-700"
                                  }`}
                                >
                                  {!answered ? "—" : studentVal ? "Đ" : "S"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Thanh tóm tắt — 3 dòng theo chuẩn đề 2025 */}
                  <div
                    className={`rounded-xl px-4 py-3 text-sm border-2 ${
                      isCorrect
                        ? "border-green-200 bg-green-50/70"
                        : p2Hits > 0
                        ? "border-amber-200 bg-amber-50/60"
                        : "border-red-200 bg-red-50/60"
                    }`}
                  >
                    <p className="text-gray-700">
                      Kết quả:{" "}
                      <span
                        className={`font-bold ${
                          isCorrect
                            ? "text-green-700"
                            : p2Hits > 0
                            ? "text-amber-700"
                            : "text-red-600"
                        }`}
                      >
                        {p2Hits}/4 ý đúng
                      </span>
                      <span className="text-gray-400 ml-2 text-xs">
                        &rarr; {p2Score} điểm
                      </span>
                    </p>
                    <p className="text-gray-700 mt-1.5">
                      Bạn trả lời:{" "}
                      <strong
                        className={`font-mono tracking-widest ${
                          isCorrect ? "text-green-700" : "text-red-600"
                        }`}
                      >
                        {p2StudentDS || "—"}
                      </strong>
                    </p>
                    <p className="text-gray-700 mt-1.5">
                      Đáp án:{" "}
                      <strong className="font-mono tracking-widest text-green-700">
                        {p2CorrectDS}
                      </strong>
                    </p>
                  </div>
                </div>
              )}

              {/* ── P3 review ────────────────────────────────────────────── */}
              {q.type === "short_answer" && (
                <div className="flex flex-wrap gap-3 mb-4 text-sm">
                  <div
                    className={`px-3 py-2 rounded-xl border ${
                      isCorrect
                        ? "border-green-300 bg-green-50 text-green-900"
                        : "border-red-300 bg-red-50 text-red-900"
                    }`}
                  >
                    <span className="opacity-60">Bạn nhập: </span>
                    <strong>
                      {p3Ans[q.id] || (
                        <em className="opacity-50">chưa trả lời</em>
                      )}
                    </strong>
                  </div>
                  <div className="px-3 py-2 rounded-xl border border-green-400 bg-green-100 text-green-900">
                    <span className="opacity-60">Đáp án đúng: </span>
                    {/* cleanPart3Answer loại bỏ $...$, chuyển {,} → , */}
                    <strong>{cleanPart3Answer(String(q.correctAnswer ?? ""))}</strong>
                  </div>
                </div>
              )}

              {/* Explanation */}
              {(q.explanation || q.explanationTikzCode) && (
                <div className="mt-3 p-4 bg-white rounded-xl border border-gray-200">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Lời giải chi tiết
                  </p>
                  {q.explanationTikzCode && (
                    <div className="mb-3 bg-gray-50 rounded-xl border border-gray-200 p-3 flex justify-center">
                      <TikzRenderer code={q.explanationTikzCode} />
                    </div>
                  )}
                  {q.explanation && (
                    <div className="text-gray-700 text-sm leading-relaxed">
                      <ExplanationRenderer explanation={q.explanation} />
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {!standalone && (
        <div className="mt-8 flex gap-4 justify-center">
          <Link
            href="/"
            className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors"
          >
            Về trang chủ
          </Link>
          <Link
            href="/student/history"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
          >
            Lịch sử làm bài
          </Link>
        </div>
      )}
    </div>
  );
}
