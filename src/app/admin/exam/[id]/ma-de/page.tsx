"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, FileText, Loader2, Printer, Settings2, Shuffle } from "lucide-react";
import AdminGuard from "@/components/AdminGuard";
import StateIcon from "@/components/StateIcon";
import ExamPreview from "@/components/exam-editor/ExamPreview";
import { useAuth } from "@/lib/AuthContext";
import type { ParsedQuestion } from "@/utils/latexParser";
import { PART_LABELS, questionPart } from "@/utils/examStructure";
import { buildExamVersion, versionCodes, type ExamVersion, type ExamVersioning } from "@/utils/examVersions";

interface ExamPayload {
  id: string;
  title: string;
  duration: number;
  questions: ParsedQuestion[];
  versioning: ExamVersioning;
}

type PrintTarget = "key" | "exam" | null;

const ROMAN = { p1: "I", p2: "II", p3: "III", p4: "IV" } as const;

/** Đáp án của một câu theo bản đề, viết gọn như bảng đáp án in. */
function answerLabel(question: ParsedQuestion): string {
  if (question.type === "multiple_choice") {
    const index = Number(question.correctAnswer);
    return Number.isInteger(index) && index >= 0 ? String.fromCharCode(65 + index) : "?";
  }
  if (question.type === "true_false") {
    const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
    return answers.map((value) => (value ? "Đ" : "S")).join("");
  }
  if (question.type === "short_answer") return String(question.correctAnswer ?? "").trim() || "?";
  return "Tự luận";
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function AnswerKeyTable({ codes, versions, activeCode }: { codes: string[]; versions: ExamVersion[]; activeCode: string | null }) {
  const base = versions[0]?.questions ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-center text-sm tabular-nums">
        <thead>
          <tr className="bg-gray-50 text-xs font-bold text-gray-600">
            <th scope="col" className="sticky left-0 border border-gray-200 bg-gray-50 px-3 py-2">Câu</th>
            {codes.map((code) => (
              <th key={code} scope="col" className={`border border-gray-200 px-3 py-2 ${code === activeCode ? "text-brand-700" : ""}`}>Mã {code}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {base.map((question, index) => {
            const part = questionPart(question.type);
            const startsPart = index === 0 || base[index - 1].type !== question.type;
            return [
              startsPart && (
                <tr key={`part-${index}`}>
                  <th scope="rowgroup" colSpan={codes.length + 1} className="border border-gray-200 bg-brand-50/60 px-3 py-1.5 text-left text-xs font-bold text-brand-800">{part ? `Phần ${ROMAN[part]} · ${PART_LABELS[part]}` : "Khác"}</th>
                </tr>
              ),
              <tr key={index} className="odd:bg-white even:bg-gray-50/50">
                <th scope="row" className="sticky left-0 border border-gray-200 bg-inherit px-3 py-1.5 font-semibold text-gray-700">{index + 1}</th>
                {versions.map((version) => (
                  <td key={version.code} className="border border-gray-200 px-3 py-1.5 font-semibold text-gray-900">{answerLabel(version.questions[index])}</td>
                ))}
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ExamVersionsPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{ exam: ExamPayload | null; error: string; loaded: boolean }>({ exam: null, error: "", loaded: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/exams/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error === "FORBIDDEN" ? "Bạn không có quyền xem đề thi này." : payload.error === "NOT_FOUND" ? "Không tìm thấy đề thi." : "Không thể tải đề thi.");
        }
        if (!cancelled) setState({ exam: payload as ExamPayload, error: "", loaded: true });
      } catch (error) {
        if (!cancelled) setState({ exam: null, error: error instanceof Error ? error.message : "Không thể tải đề thi.", loaded: true });
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, id, user]);

  const exam = state.exam;
  const codes = useMemo(() => versionCodes(exam?.versioning), [exam]);
  const versions = useMemo(
    () => (exam ? codes.map((code) => buildExamVersion(exam.questions, exam.versioning, code, exam.id)) : []),
    [codes, exam],
  );
  const activeCode = selected && codes.includes(selected) ? selected : codes[0] ?? null;
  const activeVersion = versions.find((version) => version.code === activeCode) ?? null;

  // In xong (hoặc hủy) thì trả trang về trạng thái bình thường.
  useEffect(() => {
    if (!printTarget) return;
    const reset = () => setPrintTarget(null);
    window.addEventListener("afterprint", reset);
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", reset);
    };
  }, [printTarget]);

  const downloadKeys = () => {
    if (!exam || !versions.length) return;
    const rows = [["Câu", "Phần", ...codes.map((code) => `Mã ${code}`)]];
    versions[0].questions.forEach((question, index) => {
      const part = questionPart(question.type);
      rows.push([String(index + 1), part ? PART_LABELS[part] : "", ...versions.map((version) => answerLabel(version.questions[index]))]);
    });
    const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `dap-an-${exam.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!state.loaded) {
    return (
      <AdminGuard>
        <p role="status" className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500"><Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" />Đang dựng các mã đề…</p>
      </AdminGuard>
    );
  }

  if (!exam) {
    return (
      <AdminGuard>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <StateIcon icon="alert" tone="danger" />
          <p className="mt-4 font-semibold text-gray-800">{state.error}</p>
          <Link href="/admin/dashboard" className="mt-4 inline-block text-sm font-semibold text-brand-700 underline">Về bảng điều khiển</Link>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      {/* Khi in chỉ giữ vùng đang chọn, bỏ đầu trang, menu và các nút. */}
      <style>{`@media print {
        body > *:not(#print-area) { display: none !important; }
        @page { margin: 14mm; }
      }`}</style>
      <div className="workspace-page mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
        <Link href={`/admin/exam/${id}`} className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-brand-600">
          <ArrowLeft size={16} aria-hidden="true" />Kết quả bài thi
        </Link>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-brand-700"><Shuffle size={14} aria-hidden="true" />Trộn đề</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold text-gray-900 sm:text-3xl">{exam.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {codes.length ? `${codes.length} mã đề · ${exam.questions.length} câu` : "Đề này chưa bật trộn nhiều mã."}
            </p>
          </div>
          <Link href={`/admin/edit-exam/${id}`} className="inline-flex w-fit items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-700">
            <Settings2 size={16} aria-hidden="true" />Cài đặt trộn đề
          </Link>
        </div>

        {!codes.length ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <StateIcon icon="inbox" />
            <p className="mt-4 font-display text-lg font-bold text-gray-900">Chưa có mã đề nào</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">Mở <b>Chỉnh sửa đề → Thiết lập làm bài → Trộn đề</b>, bật “Trộn thành nhiều mã đề” rồi lưu.</p>
          </div>
        ) : (
          <>
            <section aria-labelledby="answer-key-heading" className="rounded-3xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-soft)] sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="answer-key-heading" className="font-display text-lg font-extrabold text-gray-900">Bảng đáp án các mã</h2>
                <div className="ml-auto flex flex-wrap gap-2 print:hidden">
                  <button type="button" onClick={downloadKeys} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-3.5 text-sm font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-700">
                    <Download size={16} aria-hidden="true" />Tải CSV (Excel)
                  </button>
                  <button type="button" onClick={() => setPrintTarget("key")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-3.5 text-sm font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-700">
                    <Printer size={16} aria-hidden="true" />In bảng đáp án
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 print:hidden">Phần II ghi Đ/S theo thứ tự ý a, b, c, d của từng mã.</p>
              <div className="mt-4"><AnswerKeyTable codes={codes} versions={versions} activeCode={activeCode} /></div>
            </section>

            <section aria-labelledby="version-heading" className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-soft)] sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="version-heading" className="font-display text-lg font-extrabold text-gray-900">Xem từng mã</h2>
                <button type="button" onClick={() => setPrintTarget("exam")} className="edu-btn ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white">
                  <Printer size={16} aria-hidden="true" />In đề mã {activeCode}
                </button>
              </div>
              <div role="tablist" aria-label="Chọn mã đề" className="mt-4 flex flex-wrap gap-2">
                {codes.map((code) => (
                  <button
                    key={code}
                    role="tab"
                    type="button"
                    aria-selected={code === activeCode}
                    onClick={() => setSelected(code)}
                    className={`min-h-10 rounded-xl px-3.5 font-display text-sm font-bold tabular-nums transition ${code === activeCode ? "bg-brand-600 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-brand-50 hover:text-brand-700"}`}
                  >
                    {code}
                  </button>
                ))}
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500"><FileText size={14} aria-hidden="true" />Bản xem có tô đáp án; bản in là đề cho học sinh, không kèm đáp án và lời giải.</p>
              {activeVersion && (
                <div className="mt-5">
                  <ExamPreview questions={activeVersion.questions} title={exam.title} chips={[`Mã đề ${activeCode}`, `${exam.duration} phút`, `${exam.questions.length} câu`]} />
                </div>
              )}
            </section>

            {/* Bản in gắn thẳng vào body; CSS in ẩn mọi thứ khác. */}
            {printTarget && createPortal(
              <div id="print-area" className="hidden bg-white text-black print:block">
                {printTarget === "key" ? (
                  <>
                    <h1 className="mb-3 text-center font-display text-lg font-bold">Bảng đáp án · {exam.title}</h1>
                    <AnswerKeyTable codes={codes} versions={versions} activeCode={null} />
                  </>
                ) : activeVersion && (
                  <ExamPreview questions={activeVersion.questions} title={exam.title} chips={[`Mã đề ${activeCode}`, `Thời gian: ${exam.duration} phút`]} hideAnswers />
                )}
              </div>,
              document.body,
            )}
          </>
        )}
      </div>
    </AdminGuard>
  );
}
