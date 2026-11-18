"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Eraser, Hand, Highlighter, Loader2, Minus, PenLine, Plus, Redo2, Save, Send, Sparkles, Stamp, Type, Undo2,
} from "lucide-react";
import AdminGuard from "@/components/AdminGuard";
import StateIcon from "@/components/StateIcon";
import AiGradeDetail from "@/components/essay/AiGradeDetail";
import RubricList from "@/components/essay/RubricList";
import ExplanationRenderer from "@/components/ExplanationRenderer";
import EssayAnnotator, { type AnnotationTool } from "@/components/essay/EssayAnnotator";
import { useEssayPages } from "@/components/essay/useEssayPages";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import { essayQuestionPoints } from "@/utils/examStructure";
import type { AiGradingResult } from "@/utils/aiGradingTypes";
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
  const [ai, setAi] = useState<{ id: string; result: AiGradingResult | null; configured: boolean } | null>(null);
  const [aiBusy, setAiBusy] = useState<"one" | "all" | null>(null);
  const [aiProgress, setAiProgress] = useState("");
  const [filter, setFilter] = useState<"all" | "pending">("all");
  const [autoNote, setAutoNote] = useState("");
  // Bản mới nhất của phiếu chấm, để tự lưu và phím tắt đọc được mà không phải gắn lại.
  const latest = useRef({ id: "", dirty: false, invalid: false, body: "" });
  const autoInflight = useRef<Promise<boolean> | null>(null);
  const navRef = useRef<(delta: number) => void>(() => {});

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

  // Ghi điểm/nhận xét AI vào phiếu chấm. overwrite=false: chỉ điền ô còn trống.
  const fillFromAi = useCallback((result: AiGradingResult, overwrite: boolean, onlyQuestionId?: number, markDirty = true) => {
    const picked = result.questions.filter((item) => onlyQuestionId === undefined || item.questionId === onlyQuestionId);
    setScores((state) => {
      const next = { ...state };
      picked.forEach((item) => { if (overwrite || next[item.questionId] === undefined || next[item.questionId] === "") next[item.questionId] = String(item.score); });
      return next;
    });
    setComments((state) => {
      const next = { ...state };
      picked.forEach((item) => { if (item.comment && (overwrite || !next[item.questionId])) next[item.questionId] = item.comment; });
      return next;
    });
    if (onlyQuestionId === undefined && result.generalComment) setGeneralComment((value) => (overwrite || !value ? result.generalComment : value));
    if (markDirty) setDirty(true);
  }, []);

  const AI_ERRORS: Record<string, string> = {
    AI_NOT_CONFIGURED: "Máy chủ chưa có khoá API để chấm bằng AI.",
    RATE_LIMITED: "Dịch vụ AI đang giới hạn lượt gọi, chờ khoảng một phút rồi thử lại.",
    NO_FILES: "Bài này chưa có trang nào để AI đọc.",
    FILES_TOO_LARGE: "Bài làm quá nặng để gửi cho AI trong một lần.",
    ALREADY_RUNNING: "AI đang chấm bài này, chờ lượt đó xong đã.",
    AI_BAD_OUTPUT: "AI trả kết quả không đọc được, hãy thử lại.",
  };

  const requestAiGrade = useCallback(async (submissionId: string): Promise<AiGradingResult> => {
    const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/ai-grade`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await user!.getIdToken()}` },
    });
    const payload = await response.json().catch(() => null) as { result?: AiGradingResult; error?: string } | null;
    if (!response.ok || !payload?.result) throw new Error(payload?.error ?? "AI_GRADE_FAILED");
    return payload.result;
  }, [user]);

  const runAiForCurrent = async () => {
    if (!user || !current || aiBusy) return;
    setAiBusy("one");
    setNotice("");
    try {
      const result = await requestAiGrade(current.id);
      setAi({ id: current.id, result, configured: true });
      fillFromAi(result, false);
      setNotice("AI đã chấm nháp. Thầy cô xem lại từng câu rồi mới bấm Hoàn tất.");
    } catch (aiError) {
      setNotice(AI_ERRORS[aiError instanceof Error ? aiError.message : ""] ?? "AI chưa chấm được bài này, hãy thử lại.");
    } finally {
      setAiBusy(null);
    }
  };

  // Chấm lần lượt các bài chờ chấm; kết quả lưu ở máy chủ và tự điền khi mở từng bài.
  const runAiForAll = async () => {
    if (!user || !list || aiBusy) return;
    const targets = list.filter((item) => item.gradingStatus === "pending" && item.essayFileCount > 0);
    if (targets.length === 0) { setNotice("Không có bài chờ chấm nào có trang bài làm."); return; }
    if (!window.confirm(`Cho AI chấm nháp ${targets.length} bài chờ chấm? Mỗi bài mất khoảng 10–40 giây; giữ nguyên trang này trong lúc chạy.`)) return;
    setAiBusy("all");
    setNotice("");
    let done = 0;
    let failed = 0;
    for (const item of targets) {
      setAiProgress(`AI đang chấm ${done + failed + 1}/${targets.length}: ${item.studentName}`);
      try {
        const result = await requestAiGrade(item.id);
        done += 1;
        if (item.id === selectedId) { setAi({ id: item.id, result, configured: true }); fillFromAi(result, false); }
      } catch (aiError) {
        failed += 1;
        const code = aiError instanceof Error ? aiError.message : "";
        if (code === "AI_NOT_CONFIGURED") break;
        // Bị giới hạn lượt gọi: nghỉ lâu hơn trước bài kế tiếp.
        if (code === "RATE_LIMITED") await new Promise((resolve) => window.setTimeout(resolve, 30_000));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 4_000));
    }
    setAiProgress("");
    setAiBusy(null);
    setNotice(`AI đã chấm nháp ${done}/${targets.length} bài${failed ? `, ${failed} bài chưa chấm được` : ""}. Mở từng bài để duyệt điểm.`);
  };

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
      // Kết quả chấm nháp của AI (nếu đã chạy): chưa có điểm lưu thì điền sẵn để giáo viên duyệt.
      setAi(null);
      const aiResponse = await fetch(`/api/submissions/${encodeURIComponent(selectedId)}/ai-grade`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      }).catch(() => null);
      const aiPayload = aiResponse?.ok ? await aiResponse.json().catch(() => null) as { configured?: boolean; result?: AiGradingResult | null } | null : null;
      if (cancelled || !aiPayload) return;
      setAi({ id: selectedId, result: aiPayload.result ?? null, configured: Boolean(aiPayload.configured) });
      if (aiPayload.result && Object.keys(stored?.essayScores ?? {}).length === 0) fillFromAi(aiPayload.result, false, undefined, false);
    })();
    return () => { cancelled = true; };
  }, [selectedId, user, fillFromAi]);

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
      if (!event.metaKey && !event.ctrlKey && (event.key === "[" || event.key === "]")) {
        event.preventDefault();
        navRef.current(event.key === "]" ? 1 : -1);
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

  useEffect(() => {
    latest.current = {
      id: current?.id ?? "",
      dirty,
      invalid: Boolean(invalid),
      body: JSON.stringify({ essayScores: scores, essayComments: comments, generalComment, annotations: history.present, final: false }),
    };
  });

  // Lưu nháp ngầm: không đổi danh sách, không công bố điểm; học sinh không thấy.
  const autoSave = useCallback((): Promise<boolean> => {
    if (autoInflight.current) return autoInflight.current;
    const snapshot = latest.current;
    if (!user || !snapshot.id) return Promise.resolve(false);
    if (!snapshot.dirty) return Promise.resolve(true);
    if (snapshot.invalid) return Promise.resolve(false);
    const run = (async () => {
      try {
        const response = await fetch(`/api/submissions/${encodeURIComponent(snapshot.id)}/grade`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
          body: snapshot.body,
        });
        if (!response.ok) throw new Error("SAVE_FAILED");
        // Chỉ coi là sạch khi trong lúc lưu giáo viên chưa sửa thêm gì.
        if (latest.current.id === snapshot.id && latest.current.body === snapshot.body) setDirty(false);
        setAutoNote(`Đã tự lưu nháp lúc ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`);
        return true;
      } catch {
        setAutoNote("Chưa tự lưu được, kiểm tra mạng.");
        return false;
      } finally {
        autoInflight.current = null;
      }
    })();
    autoInflight.current = run;
    return run;
  }, [user]);

  // Sửa xong dừng tay 8 giây thì tự lưu nháp.
  useEffect(() => {
    if (!dirty || saving) return;
    const timer = window.setTimeout(() => { void autoSave(); }, 8000);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, scores, comments, generalComment, history.present, autoSave]);

  // Đóng tab hay tải lại khi chưa lưu: trình duyệt hỏi lại.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const save = async (final: boolean) => {
    if (!user || !current) return;
    // Chờ lượt tự lưu đang chạy xong, tránh nó ghi đè bản nháp sau khi đã công bố.
    if (autoInflight.current) await autoInflight.current;
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
      setAutoNote("");
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

  const openSubmission = async (id: string) => {
    if (id === selectedId) return;
    if (dirty) {
      // Lưu nháp trước khi chuyển; chỉ hỏi khi không lưu được.
      const saved = await autoSave();
      if (!saved && !window.confirm("Không lưu nháp được. Chuyển bài khác và bỏ thay đổi?")) return;
    }
    router.push(`/admin/grade/${examId}?s=${id}`);
  };

  const visibleList = useMemo(
    () => (list ?? []).filter((item) => filter === "all" || item.gradingStatus === "pending" || item.id === selectedId),
    [list, filter, selectedId],
  );
  const position = visibleList.findIndex((item) => item.id === selectedId);
  useEffect(() => {
    navRef.current = (delta: number) => {
      const target = visibleList[position + delta];
      if (target) void openSubmission(target.id);
    };
  });

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
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <div role="group" aria-label="Lọc bài" className="flex h-11 shrink-0 rounded-xl border border-gray-200 bg-white p-0.5 text-xs font-semibold">
              {([["all", `Tất cả ${list.length}`], ["pending", `Chờ chấm ${pendingCount}`]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
                  className={`rounded-[10px] px-2.5 transition ${filter === value ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</button>
              ))}
            </div>
            <button type="button" onClick={() => navRef.current(-1)} disabled={position <= 0} title="Bài trước ([)" aria-label="Bài trước"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-brand-700 disabled:opacity-30"><ChevronLeft size={18} aria-hidden="true" /></button>
            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <span className="sr-only">Chọn bài làm</span>
              <select value={selectedId ?? ""} onChange={(event) => void openSubmission(event.target.value)} className="h-11 w-full appearance-none truncate rounded-xl border border-gray-200 bg-white pl-3 pr-9 text-sm font-semibold text-gray-800 outline-none focus:border-brand-400">
                {visibleList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.gradingStatus === "pending" ? "Chờ chấm" : "Đã chấm"} · {item.studentName}{item.isTeacherPreview ? " (bài thử GV)" : ""} · {item.essayFileCount} trang
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            </label>
            <button type="button" onClick={() => navRef.current(1)} disabled={position < 0 || position >= visibleList.length - 1} title="Bài sau (])" aria-label="Bài sau"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-brand-700 disabled:opacity-30"><ChevronRight size={18} aria-hidden="true" /></button>
            {position >= 0 && <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-500">{position + 1}/{visibleList.length}</span>}
          </div>
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

            {ai?.id === selectedId && ai.configured && (
              <div className="rounded-3xl border border-violet-200 bg-white p-3 shadow-[var(--shadow-soft)]">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void runAiForCurrent()} disabled={Boolean(aiBusy) || !current || (current.data.files.length === 0)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-violet-600 px-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50">
                    {aiBusy === "one" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}{ai.result ? "AI chấm lại" : "Chấm bằng AI"}
                  </button>
                  <button type="button" onClick={() => void runAiForAll()} disabled={Boolean(aiBusy)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-violet-200 px-3 text-sm font-semibold text-violet-800 transition hover:bg-violet-50 disabled:opacity-50">
                    {aiBusy === "all" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}AI chấm các bài chờ
                  </button>
                </div>
                <p role="status" className="mt-2 text-[11px] leading-5 text-gray-500">
                  {aiProgress || (aiBusy === "one" ? "AI đang đọc bài làm, thường mất 10–40 giây…" : ai.result ? `AI chấm nháp lúc ${new Date(ai.result.gradedAtMillis).toLocaleString("vi-VN")}. Điểm chỉ là gợi ý, học sinh chưa thấy.` : "AI đọc ảnh bài làm và chấm nháp theo thang chấm. Thầy cô duyệt rồi mới công bố.")}
                </p>
              </div>
            )}

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
                    {(() => {
                      const aiQuestion = ai?.id === selectedId ? ai.result?.questions.find((item) => item.questionId === question.id) : undefined;
                      return aiQuestion && ai?.result ? <AiGradeDetail result={aiQuestion} rubric={question.rubric ?? []} onApply={() => fillFromAi(ai.result!, true, question.id)} /> : null;
                    })()}
                    <details className="group mt-2 text-sm">
                      <summary className="cursor-pointer list-none text-xs font-semibold text-gray-500 marker:hidden"><span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Đề bài và hướng dẫn chấm</summary>
                      <div className="mt-2 space-y-2 rounded-xl bg-gray-50 p-2.5 text-[13px] leading-6 text-gray-800">
                        <div>{processLatexText(question.questionText)}</div>
                        {question.rubric?.length ? <div className="border-t border-gray-200 pt-2"><RubricList rubric={question.rubric} /></div> : null}
                        {question.explanation ? <div className="border-t border-gray-200 pt-2"><ExplanationRenderer explanation={question.explanation} /></div> : !question.rubric?.length && <p className="text-xs text-gray-400">Đề không có \loigiai làm hướng dẫn chấm.</p>}
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
            {!notice && (dirty || autoNote) && <p role="status" className={`px-1 text-xs font-semibold ${dirty ? "text-amber-700" : autoNote.startsWith("Chưa") ? "text-rose-700" : "text-emerald-700"}`}>{dirty ? "Có thay đổi chưa lưu…" : autoNote}</p>}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button type="button" onClick={() => void save(false)} disabled={Boolean(saving) || !current} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:border-brand-300 disabled:opacity-50">
                {saving === "draft" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}Lưu nháp
              </button>
              <button type="button" onClick={() => void save(true)} disabled={Boolean(saving) || !current || !allScored || Boolean(invalid)} className="edu-btn inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-50">
                {saving === "final" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : currentItem?.gradingStatus === "graded" ? <Check size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {currentItem?.gradingStatus === "graded" ? "Cập nhật điểm" : "Hoàn tất & chấm bài tiếp"}
              </button>
            </div>
            <p className="px-1 text-[11px] leading-5 text-gray-400">Học sinh chỉ thấy điểm, bài chữa và nhận xét sau khi bấm Hoàn tất. Phím tắt: V P H T S E, Ctrl+Z, [ bài trước, ] bài sau. Bản nháp tự lưu sau 8 giây.</p>
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
