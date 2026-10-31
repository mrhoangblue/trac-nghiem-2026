"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft, Check, ChevronDown, Eraser, Hand, Highlighter, Loader2, Minus, PenLine, Plus, Redo2, Save, Send, Stamp, Type, Undo2,
} from "lucide-react";
import AdminGuard from "@/components/AdminGuard";
import StateIcon from "@/components/StateIcon";
import ExplanationRenderer from "@/components/ExplanationRenderer";
import EssayAnnotator, { type AnnotationTool } from "@/components/essay/EssayAnnotator";
import { useEssayPages } from "@/components/essay/useEssayPages";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import { essayQuestionPoints } from "@/utils/examStructure";
import { ESSAY_STAMPS, type EssayAnnotations, type EssayFileView, type EssayGrading, type EssayStampKind } from "@/utils/essayTypes";

interface ExamInfo {
  title: string;
  questions: ParsedQuestion[];
  part4TotalScore: number;
}

interface ListItem {
  id: string;
  studentName: string;
  studentEmail: string;
  submittedAtMillis: number | null;
  gradingStatus: "pending" | "graded" | null;
  essayFileCount: number;
  isTeacherPreview: boolean;
  scores: { total?: number; p4?: number | null };
}

interface LoadedSubmission {
  files: EssayFileView[];
  uploadOpen: boolean;
  grading: EssayGrading | null;
  annotations: EssayAnnotations | null;
  submission: {
    studentName: string;
    studentEmail: string;
    scores: { p1?: number; p2?: number; p3?: number; p4?: number | null; total?: number } | null;
  } | null;
}

const TOOLS: Array<{ value: AnnotationTool; label: string; shortcut: string; icon: typeof Hand }> = [
  { value: "hand", label: "Cuộn", shortcut: "V", icon: Hand },
  { value: "pen", label: "Bút", shortcut: "P", icon: PenLine },
  { value: "highlighter", label: "Dạ quang", shortcut: "H", icon: Highlighter },
  { value: "text", label: "Chữ", shortcut: "T", icon: Type },
  { value: "stamp", label: "Dấu", shortcut: "S", icon: Stamp },
  { value: "eraser", label: "Tẩy", shortcut: "E", icon: Eraser },
];
const COLORS = ["#e11d48", "#2563eb", "#16a34a"];
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5];
const fmt = (value: number | null | undefined) => (value ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });

function GradeWorkspace() {
  const { examId } = useParams<{ examId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const selectedId = searchParams.get("s");

  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [list, setList] = useState<ListItem[] | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<{ id: string; data: LoadedSubmission } | null>(null);
  const [history, setHistory] = useState<{ past: EssayAnnotations[]; present: EssayAnnotations; future: EssayAnnotations[] }>({ past: [], present: {}, future: [] });
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [generalComment, setGeneralComment] = useState("");
  const [pickedQuestion, setActiveQuestion] = useState<number | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [stamp, setStamp] = useState<EssayStampKind>("check");
  const [penOnly, setPenOnly] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"draft" | "final" | null>(null);
  const [notice, setNotice] = useState("");

  const essayQuestions = useMemo(() => exam?.questions.filter((question) => question.type === "essay") ?? [], [exam]);
  const maxPoints = useMemo(() => exam ? essayQuestionPoints(exam.questions, exam.part4TotalScore) : new Map<number, number>(), [exam]);
  // Câu đang nhận điểm từ dấu "+0,25"/"+0,5"; mặc định câu tự luận đầu tiên.
  const activeQuestion = pickedQuestion ?? essayQuestions[0]?.id ?? null;
  const files = current?.data.files ?? null;
  const { pages, loading: pagesLoading, error: pagesError } = useEssayPages(files);

  const loadList = useCallback(async () => {
    if (!user) return;
    const response = await fetch(`/api/exams/${encodeURIComponent(examId)}/submissions?includePreview=1`, {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { submissions?: ListItem[]; error?: string } | null;
    if (!response.ok) throw new Error(payload?.error ?? "LOAD_FAILED");
    const items = (payload?.submissions ?? [])
      .filter((item) => item.gradingStatus)
      .sort((a, b) => (a.gradingStatus === b.gradingStatus ? (a.submittedAtMillis ?? 0) - (b.submittedAtMillis ?? 0) : a.gradingStatus === "pending" ? -1 : 1));
    setList(items);
    return items;
  }, [examId, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await getDoc(doc(db, "exams", examId));
        if (!snapshot.exists()) throw new Error("NOT_FOUND");
        const data = snapshot.data();
        if (cancelled) return;
        setExam({
          title: String(data.title ?? "Bài thi"),
          questions: Array.isArray(data.questions) ? data.questions as ParsedQuestion[] : [],
          part4TotalScore: Number(data.scoringConfig?.part4TotalScore ?? 0),
        });
        await loadList();
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) setError("Không tải được bài thi hoặc bạn không có quyền chấm đề này.");
      }
    })();
    return () => { cancelled = true; };
  }, [examId, user, loadList]);

  // Chưa chọn bài nào: mở bài chờ chấm đầu tiên.
  useEffect(() => {
    if (selectedId || !list?.length) return;
    router.replace(`/admin/grade/${examId}?s=${list[0].id}`);
  }, [examId, list, router, selectedId]);

  useEffect(() => {
    if (!user || !selectedId) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/submissions/${encodeURIComponent(selectedId)}/essay`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as LoadedSubmission | null;
      if (cancelled) return;
      if (!response.ok || !payload) { setError("Không mở được bài làm này."); return; }
      setCurrent({ id: selectedId, data: payload });
      setHistory({ past: [], present: payload.annotations ?? {}, future: [] });
      const stored = payload.grading;
      setScores(Object.fromEntries(Object.entries(stored?.essayScores ?? {}).map(([key, value]) => [key, String(value)])));
      setComments(stored?.essayComments ?? {});
      setGeneralComment(stored?.generalComment ?? "");
      setDirty(false);
      setNotice("");
    })();
    return () => { cancelled = true; };
  }, [selectedId, user]);

  const changeAnnotations = useCallback((next: EssayAnnotations) => {
    setHistory((state) => ({ past: [...state.past.slice(-99), state.present], present: next, future: [] }));
    setDirty(true);
  }, []);
  const undo = useCallback(() => setHistory((state) => state.past.length ? { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] } : state), []);
  const redo = useCallback(() => setHistory((state) => state.future.length ? { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) } : state), []);

  const addPoints = useCallback((stampKind: EssayStampKind) => {
    const points = ESSAY_STAMPS[stampKind].points;
    if (!points || activeQuestion === null) return;
    const max = maxPoints.get(activeQuestion) ?? 0;
    setScores((state) => {
      const next = Math.min(max, Math.round((Number(state[activeQuestion] || 0) + points) * 100) / 100);
      return { ...state, [activeQuestion]: String(next) };
    });
  }, [activeQuestion, maxPoints]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      const match = TOOLS.find((item) => item.shortcut.toLowerCase() === event.key.toLowerCase());
      if (match && !event.metaKey && !event.ctrlKey) setTool(match.value);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [redo, undo]);

  const p4 = Math.round(essayQuestions.reduce((sum, question) => sum + (Number(scores[question.id]) || 0), 0) * 100) / 100;
  const auto = current?.data.submission?.scores;
  const autoTotal = (auto?.p1 ?? 0) + (auto?.p2 ?? 0) + (auto?.p3 ?? 0);
  const allScored = essayQuestions.every((question) => scores[question.id] !== undefined && scores[question.id] !== "");
  const invalid = essayQuestions.find((question) => {
    const raw = scores[question.id];
    if (raw === undefined || raw === "") return false;
    const value = Number(raw);
    return !Number.isFinite(value) || value < 0 || value > (maxPoints.get(question.id) ?? 0);
  });

  const save = async (final: boolean) => {
    if (!user || !current) return;
    if (invalid) { setNotice(`Điểm câu ${exam!.questions.indexOf(invalid) + 1} vượt quá điểm tối đa.`); return; }
    if (final && !allScored) { setNotice("Cần nhập điểm cho mọi câu tự luận trước khi hoàn tất."); return; }
    setSaving(final ? "final" : "draft");
    setNotice("");
    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(current.id)}/grade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ essayScores: scores, essayComments: comments, generalComment, annotations: history.present, final }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "SAVE_FAILED");
      setDirty(false);
      const items = await loadList();
      if (final) {
        const next = items?.find((item) => item.gradingStatus === "pending" && item.id !== current.id);
        if (next) router.push(`/admin/grade/${examId}?s=${next.id}`);
        else setNotice("Đã chấm xong tất cả bài của đề này.");
      } else {
        setNotice("Đã lưu nháp.");
      }
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : "";
      setNotice(code === "ANNOTATIONS_TOO_LARGE" ? "Nét chấm quá nhiều, hãy xóa bớt rồi lưu lại." : "Không lưu được, kiểm tra mạng rồi thử lại.");
    } finally {
      setSaving(null);
    }
  };

  const openSubmission = (id: string) => {
    if (dirty && !window.confirm("Bài đang chấm chưa lưu. Chuyển bài khác và bỏ thay đổi?")) return;
    router.push(`/admin/grade/${examId}?s=${id}`);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <StateIcon icon="alert" tone="danger" className="mx-auto" />
        <p className="mt-4 font-semibold text-gray-800">{error}</p>
        <Link href="/admin/exam-list" className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700">Về danh sách đề</Link>
      </div>
    );
  }
  if (!exam || !list) {
    return <div role="status" className="flex flex-1 items-center justify-center py-20 text-sm text-gray-500"><Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" />Đang tải bài cần chấm…</div>;
  }

  const pendingCount = list.filter((item) => item.gradingStatus === "pending").length;
  const currentItem = list.find((item) => item.id === selectedId);

  return (
    <div className="workspace-page mx-auto w-full max-w-[1600px] px-3 pb-8 pt-5 sm:px-5">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/admin/exam/${examId}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-brand-700" aria-label="Về kết quả đề"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-brand-600">Chấm tự luận · còn {pendingCount}/{list.length} bài chờ chấm</p>
          <h1 className="truncate font-display text-lg font-extrabold text-gray-900 sm:text-xl">{exam.title}</h1>
        </div>
        {list.length > 0 && (
          <label className="relative min-w-0 sm:w-80">
            <span className="sr-only">Chọn bài làm</span>
            <select value={selectedId ?? ""} onChange={(event) => openSubmission(event.target.value)} className="h-11 w-full appearance-none truncate rounded-xl border border-gray-200 bg-white pl-3 pr-9 text-sm font-semibold text-gray-800 outline-none focus:border-brand-400">
              {list.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.gradingStatus === "pending" ? "Chờ chấm" : "Đã chấm"} · {item.studentName}{item.isTeacherPreview ? " (bài thử GV)" : ""} · {item.essayFileCount} trang
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          </label>
        )}
      </header>

      {list.length === 0 ? (
        <div className="rounded-3xl border border-gray-200 bg-white px-6 py-16 text-center">
          <StateIcon icon="inbox" tone="muted" className="mx-auto" />
          <p className="mt-4 font-semibold text-gray-800">Chưa có bài tự luận nào được nộp.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-label="Bài làm" className="min-w-0">
            <div role="toolbar" aria-label="Công cụ chấm" className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-1.5 rounded-2xl border border-gray-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
              {TOOLS.map(({ value, label, shortcut, icon: Icon }) => (
                <button key={value} type="button" onClick={() => setTool(value)} aria-pressed={tool === value} title={`${label} (${shortcut})`}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold transition ${tool === value ? "bg-brand-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                  <Icon size={17} aria-hidden="true" /><span className="hidden xl:inline">{label}</span>
                </button>
              ))}
              <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden="true" />
              {COLORS.map((value) => (
                <button key={value} type="button" onClick={() => setColor(value)} aria-label={`Màu ${value}`} aria-pressed={color === value}
                  className={`h-8 w-8 rounded-full ring-2 ring-offset-2 transition ${color === value ? "ring-gray-900" : "ring-transparent"}`} style={{ background: value }} />
              ))}
              {tool === "stamp" && (
                <>
                  <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden="true" />
                  {(Object.keys(ESSAY_STAMPS) as EssayStampKind[]).map((kind) => (
                    <button key={kind} type="button" onClick={() => setStamp(kind)} aria-pressed={stamp === kind}
                      className={`h-10 min-w-10 rounded-xl px-2 text-sm font-extrabold transition ${stamp === kind ? "bg-rose-50 text-rose-700 ring-1 ring-rose-300" : "text-gray-600 hover:bg-gray-100"}`}>
                      {ESSAY_STAMPS[kind].label}
                    </button>
                  ))}
                </>
              )}
              <span className="ml-auto flex items-center gap-1">
                <button type="button" onClick={undo} disabled={!history.past.length} aria-label="Hoàn tác (Ctrl+Z)" className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-30"><Undo2 size={17} aria-hidden="true" /></button>
                <button type="button" onClick={redo} disabled={!history.future.length} aria-label="Làm lại (Ctrl+Shift+Z)" className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-30"><Redo2 size={17} aria-hidden="true" /></button>
                <button type="button" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} aria-label="Thu nhỏ" className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100"><Minus size={17} aria-hidden="true" /></button>
                <span className="w-11 text-center text-xs font-semibold tabular-nums text-gray-500">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} aria-label="Phóng to" className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100"><Plus size={17} aria-hidden="true" /></button>
              </span>
              <label className="flex basis-full items-center gap-2 px-2 pb-1 text-xs text-gray-500 sm:basis-auto sm:pb-0">
                <input type="checkbox" checked={penOnly} onChange={(event) => setPenOnly(event.target.checked)} className="h-4 w-4 accent-brand-600" />
                Chỉ vẽ bằng bút cảm ứng (ngón tay để cuộn)
              </label>
            </div>

            {current?.data.uploadOpen && (
              <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Học sinh vẫn đang trong thời gian nộp ảnh, bài có thể còn thêm trang.</p>
            )}
            <div className="overflow-x-auto rounded-3xl border border-gray-200 bg-gray-100/80 px-3 pb-8 sm:px-6">
              <div className="mx-auto" style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? 900 : undefined, minWidth: zoom > 1 ? `${zoom * 100}%` : undefined }}>
                {!current || current.id !== selectedId || pagesLoading ? (
                  <p role="status" className="flex items-center justify-center py-24 text-sm text-gray-500"><Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" />Đang mở bài làm…</p>
                ) : pages.length === 0 ? (
                  <p className="py-24 text-center text-sm text-gray-500">{pagesError || "Học sinh không nộp trang nào cho phần tự luận."}</p>
                ) : (
                  <EssayAnnotator pages={pages} annotations={history.present} onChange={changeAnnotations} tool={tool} color={color} stamp={stamp} penOnly={penOnly} onStampPlaced={addPoints} />
                )}
              </div>
            </div>
          </section>

          <aside aria-label="Phiếu chấm" className="min-w-0 space-y-3 lg:sticky lg:top-16">
            <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-soft)]">
              <p className="truncate font-display font-bold text-gray-900">{currentItem?.studentName ?? current?.data.submission?.studentName ?? "Học sinh"}</p>
              <p className="truncate text-xs text-gray-500">{currentItem?.studentEmail}</p>
              <dl className="mt-3 grid grid-cols-4 gap-1.5 text-center text-xs">
                {[["I", auto?.p1], ["II", auto?.p2], ["III", auto?.p3], ["IV", p4]].map(([label, value]) => (
                  <div key={String(label)} className={`rounded-xl px-1 py-2 ${label === "IV" ? "bg-violet-50 text-violet-800" : "bg-gray-50 text-gray-700"}`}>
                    <dt className="font-semibold">Phần {label}</dt><dd className="font-display text-base font-extrabold tabular-nums">{fmt(value as number)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-baseline justify-between rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-white">
                <span className="text-sm font-semibold">Tổng điểm</span>
                <span className="font-display text-2xl font-extrabold tabular-nums">{fmt(autoTotal + p4)}</span>
              </p>
            </div>

            <div className="max-h-[calc(100vh-22rem)] space-y-2.5 overflow-y-auto rounded-3xl border border-gray-200 bg-white p-3 shadow-[var(--shadow-soft)] lg:max-h-[calc(100vh-24rem)]">
              {essayQuestions.map((question) => {
                const number = exam.questions.indexOf(question) + 1;
                const max = maxPoints.get(question.id) ?? 0;
                const active = activeQuestion === question.id;
                const raw = scores[question.id] ?? "";
                const over = raw !== "" && (Number(raw) > max || Number(raw) < 0);
                return (
                  <div key={question.id} className={`rounded-2xl border p-3 transition ${active ? "border-brand-300 bg-brand-50/40 ring-1 ring-brand-200" : "border-gray-200"}`} onFocusCapture={() => setActiveQuestion(question.id)} onClick={() => setActiveQuestion(question.id)}>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-gray-900">Câu {number}</span>
                      {active && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">nhận điểm từ dấu</span>}
                      <label className="ml-auto flex items-center gap-1.5 text-sm">
                        <span className="sr-only">Điểm câu {number}</span>
                        <input type="number" inputMode="decimal" min={0} max={max} step={0.25} value={raw}
                          onChange={(event) => { setScores({ ...scores, [question.id]: event.target.value }); setDirty(true); }}
                          aria-invalid={over}
                          className={`h-10 w-20 rounded-xl border px-2 text-right font-display font-bold tabular-nums outline-none focus:border-brand-400 ${over ? "border-rose-400 bg-rose-50 text-rose-700" : "border-gray-200"}`} />
                        <span className="text-gray-500">/ {fmt(max)}</span>
                      </label>
                    </div>
                    <details className="group mt-2 text-sm">
                      <summary className="cursor-pointer list-none text-xs font-semibold text-gray-500 marker:hidden"><span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Đề bài và hướng dẫn chấm</summary>
                      <div className="mt-2 space-y-2 rounded-xl bg-gray-50 p-2.5 text-[13px] leading-6 text-gray-800">
                        <div>{processLatexText(question.questionText)}</div>
                        {question.explanation ? <div className="border-t border-gray-200 pt-2"><ExplanationRenderer explanation={question.explanation} /></div> : <p className="text-xs text-gray-400">Đề không có \loigiai làm hướng dẫn chấm.</p>}
                      </div>
                    </details>
                    <textarea value={comments[question.id] ?? ""} onChange={(event) => { setComments({ ...comments, [question.id]: event.target.value }); setDirty(true); }}
                      rows={2} placeholder="Nhận xét câu này (không bắt buộc)" aria-label={`Nhận xét câu ${number}`}
                      className="mt-2 w-full resize-y rounded-xl border border-gray-200 px-2.5 py-2 text-sm outline-none focus:border-brand-400" />
                  </div>
                );
              })}
              <textarea value={generalComment} onChange={(event) => { setGeneralComment(event.target.value); setDirty(true); }} rows={2} placeholder="Nhận xét chung cho cả bài" aria-label="Nhận xét chung"
                className="w-full resize-y rounded-xl border border-gray-200 px-2.5 py-2 text-sm outline-none focus:border-brand-400" />
            </div>

            {notice && <p role="status" className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">{notice}</p>}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button type="button" onClick={() => void save(false)} disabled={Boolean(saving) || !current} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:border-brand-300 disabled:opacity-50">
                {saving === "draft" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}Lưu nháp
              </button>
              <button type="button" onClick={() => void save(true)} disabled={Boolean(saving) || !current || !allScored || Boolean(invalid)} className="edu-btn inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-50">
                {saving === "final" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : currentItem?.gradingStatus === "graded" ? <Check size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {currentItem?.gradingStatus === "graded" ? "Cập nhật điểm" : "Hoàn tất & chấm bài tiếp"}
              </button>
            </div>
            <p className="px-1 text-[11px] leading-5 text-gray-400">Học sinh chỉ thấy điểm, bài chữa và nhận xét sau khi bấm Hoàn tất. Phím tắt: V P H T S E, Ctrl+Z.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function GradeEssayPage() {
  return (
    <AdminGuard>
      <Suspense fallback={null}>
        <GradeWorkspace />
      </Suspense>
    </AdminGuard>
  );
}
