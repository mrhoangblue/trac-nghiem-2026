"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import {
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { formatCountdown } from "@/utils/examTypes";
import { essayQuestionPoints, hasEssayPart } from "@/utils/examStructure";
import { toDateTimeLocal, toStoredDateTime } from "@/utils/examSchedule";
import { AlertTriangle, Mail, PenTool, RotateCcw, Shuffle, X } from "lucide-react";
import { ClassPanels, NO_CLASS, QuestionBreakdown, ResultAnalytics, ResultFilters, SortHeader } from "@/components/exam-results/ExamResultPanels";
import { classBreakdown, classIdsOf, matchesSearch, questionStats, scoreSummary, sortStudents, type ClassRoster, type ResultStudent, type SortKey } from "@/utils/examResultStats";
import StateIcon from "@/components/StateIcon";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScoringConfig {
  part1TotalScore: number;
  part3TotalScore: number;
}

interface ExamData {
  title: string;
  part1Count: number;
  part2Count: number;
  part3Count: number;
  scoringConfig: ScoringConfig;
  authorEmail: string;
  startTime: string | null;
  endTime: string | null;
  /** Đề 4 phần có tự luận. */
  hasEssay: boolean;
  /** Đề bật trộn nhiều mã. */
  hasVersions: boolean;
  /** Tổng điểm Phần IV và điểm tối đa từng câu tự luận (số thứ tự câu trong đề). */
  part4TotalScore: number;
  essayPoints: Array<{ number: number; points: number }>;
}

interface Submission {
  id: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string;
  submittedAt: Timestamp | null;
  part1Results: boolean[];
  part2Results: number[];
  part3Results: boolean[];
  cheatCount?: number;
  totalElapsedSeconds?: number;
  idleBeforeSubmitSeconds?: number;
  /** Điểm Phần IV đã chấm; null khi chưa chấm hoặc đề không có tự luận. */
  p4: number | null;
  gradingStatus: "pending" | "graded" | null;
  examCode: string | null;
  studentId: string | null;
  /** Phương án đã chọn ở Phần I; null khi đề trộn mã hoặc bài nộp cũ không lưu. */
  p1Choices: Array<number | null> | null;
}

interface ScoreBreakdown {
  p1: number;
  p2: number;
  p3: number;
  total: number;
}

interface StudentRow {
  studentEmail: string;
  studentName: string;
  studentAvatar: string;
  attempts: number;
  bestScore: ScoreBreakdown;
  bestSub: Submission;
  latestSubmittedAt: Timestamp | null;
  totalCheatCount: number;
}

// ── Scoring Utilities (unchanged) ─────────────────────────────────────────────

/** P1: equal weight per question */
function calcP1(results: boolean[], totalScore: number): number {
  const count = results.length;
  if (count === 0) return 0;
  const perQ = totalScore / count;
  const correct = results.filter(Boolean).length;
  return Math.round(correct * perQ * 100) / 100;
}

/**
 * P2: fixed rule per question.
 * Each element in results is the number of correctly-answered statements (0-4).
 */
function calcP2(results: number[]): number {
  const TABLE = [0, 0.1, 0.25, 0.5, 1.0];
  const total = results.reduce((sum, n) => sum + (TABLE[n] ?? 0), 0);
  return Math.round(total * 100) / 100;
}

/** P3: equal weight per question */
function calcP3(results: boolean[], totalScore: number): number {
  const count = results.length;
  if (count === 0) return 0;
  const perQ = totalScore / count;
  const correct = results.filter(Boolean).length;
  return Math.round(correct * perQ * 100) / 100;
}

function calcScores(sub: Submission, config: ScoringConfig): ScoreBreakdown {
  const p1 = calcP1(sub.part1Results ?? [], config.part1TotalScore);
  const p2 = calcP2(sub.part2Results ?? []);
  const p3 = calcP3(sub.part3Results ?? [], config.part3TotalScore);
  const p4 = sub.gradingStatus === "graded" ? sub.p4 ?? 0 : 0;
  return { p1, p2, p3, total: Math.round((p1 + p2 + p3 + p4) * 100) / 100 };
}

// ── Group submissions by unique student ───────────────────────────────────────

function groupSubmissionsByStudent(
  subs: Submission[],
  config: ScoringConfig
): StudentRow[] {
  const map = new Map<string, Submission[]>();
  for (const sub of subs) {
    const key = sub.studentEmail || sub.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(sub);
  }

  return Array.from(map.values()).map((attempts) => {
    // Latest by submittedAt
    const sorted = [...attempts].sort(
      (a, b) => (b.submittedAt?.toMillis() ?? 0) - (a.submittedAt?.toMillis() ?? 0)
    );

    // Best attempt by total score
    const withScores = attempts.map((sub) => ({ sub, score: calcScores(sub, config) }));
    const best = withScores.reduce((a, b) => (a.score.total >= b.score.total ? a : b));

    return {
      studentEmail: attempts[0].studentEmail,
      studentName: attempts[0].studentName,
      studentAvatar: attempts[0].studentAvatar,
      attempts: attempts.length,
      bestScore: best.score,
      bestSub: best.sub,
      latestSubmittedAt: sorted[0].submittedAt,
      totalCheatCount: attempts.reduce((sum, s) => sum + (s.cheatCount ?? 0), 0),
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateTime(ts: Timestamp | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleString("vi-VN");
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải dữ liệu…</p>
    </div>
  );
}

function ResetSubmissionDialog({
  student,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  student: StudentRow;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0F2E]/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-submission-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-danger-200 bg-[#FFFFFF] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-danger-100 bg-danger-50/70 px-6 py-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-danger-100 text-danger-700">
              <AlertTriangle size={24} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-danger-700">Hành động cần xác nhận</p>
              <h2 id="reset-submission-title" className="mt-1 text-xl font-black text-[#101828]">
                Reset bài làm của {student.studentName}?
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-danger-200 bg-white text-gray-500 hover:text-danger-700 disabled:opacity-50"
            aria-label="Đóng hộp xác nhận"
          >
            <X size={17} />
          </button>
        </div>

        <div className="px-6 py-6">
          <div className="rounded-2xl border border-[#EAECF0] bg-white px-5 py-4">
            <p className="font-bold text-gray-900">{student.studentEmail}</p>
            <p className="mt-1 text-sm text-gray-500">
              Đang có <strong className="text-danger-700">{student.attempts} lượt đã nộp</strong> trong đề này.
            </p>
          </div>
          <ul className="mt-5 space-y-2 text-sm leading-6 text-gray-600">
            <li>• Toàn bộ điểm, đáp án và nhật ký làm bài của học sinh trong đề này sẽ bị xóa.</li>
            <li>• Phiên đang làm dở của học sinh, nếu có, cũng sẽ được reset.</li>
            <li>• Học sinh có thể bắt đầu lại từ đầu, miễn là đề vẫn đang mở.</li>
          </ul>
          <p className="mt-4 text-sm font-bold text-danger-700">Không thể khôi phục bài làm sau khi xác nhận.</p>

          {error && (
            <p className="mt-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700" role="alert">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:border-gray-400 disabled:opacity-50"
            >
              Giữ nguyên bài làm
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-danger-900/10 hover:bg-danger-800 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <RotateCcw size={17} />
              )}
              {busy ? "Đang reset…" : "Xác nhận reset"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const classId = useSearchParams().get("classId")?.trim() ?? "";
  const { user, isMod, isAdmin, loading: authLoading } = useAuth();

  const [exam, setExam] = useState<ExamData | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [newEndTime, setNewEndTime] = useState("");
  const [extending, setExtending] = useState(false);
  const [studentToReset, setStudentToReset] = useState<StudentRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [classes, setClasses] = useState<ClassRoster[]>([]);
  const [p1Correct, setP1Correct] = useState<Array<number | null>>([]);
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "total", direction: "desc" });

  useEffect(() => {
    if (!id || authLoading) return;

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setSubmissions([]);
      setError(null);
      try {
        // 1. Fetch exam metadata
        const examDoc = await getDoc(doc(db, "exams", id));
        if (!examDoc.exists()) {
          setError("Không tìm thấy bài thi.");
          return;
        }
        const d = examDoc.data();
        const examData: ExamData = {
          title: d.title ?? "Bài thi không có tên",
          part1Count: d.part1Count ?? 0,
          part2Count: d.part2Count ?? 0,
          part3Count: d.part3Count ?? 0,
          scoringConfig: d.scoringConfig ?? { part1TotalScore: 3, part3TotalScore: 3 },
          authorEmail: d.authorEmail ?? "",
          startTime: d.startTime ?? null,
          endTime: d.endTime ?? null,
          hasEssay: hasEssayPart(d.structure),
          part4TotalScore: Number(d.scoringConfig?.part4TotalScore ?? 0),
          essayPoints: hasEssayPart(d.structure) && Array.isArray(d.questions)
            ? (() => {
                const questions = d.questions as Array<{ id: number; type: string; points?: number }>;
                const points = essayQuestionPoints(questions, Number(d.scoringConfig?.part4TotalScore ?? 0));
                return questions.flatMap((question, index) => (
                  question.type === "essay" ? [{ number: index + 1, points: points.get(question.id) ?? 0 }] : []
                ));
              })()
            : [],
          hasVersions: d.versioning?.enabled === true,
        };

        // Privacy check: mods can only view results for their own exams
        if (isMod && !isAdmin && examData.authorEmail !== user?.email) {
          setError("Bạn không có quyền xem kết quả bài thi này.");
          return;
        }

        setExam(examData);
        setNewEndTime(toDateTimeLocal(examData.endTime));

        // 2. Fetch submissions for this exam
        const token = await user?.getIdToken();
        if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
        const submissionResponse = await fetch(`/api/exams/${encodeURIComponent(id)}/submissions${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const submissionPayload = await submissionResponse.json().catch(() => null) as {
          submissions?: Array<Record<string, unknown>>;
          classes?: ClassRoster[];
          p1Correct?: Array<number | null>;
          error?: string;
        } | null;
        if (!submissionResponse.ok) {
          throw new Error(submissionPayload?.error ?? "Không thể tải kết quả bài thi.");
        }
        if (cancelled) return;
        const subs: Submission[] = (submissionPayload?.submissions ?? []).map((s) => {
          return {
            id: String(s.id ?? ""),
            studentName: String(s.studentName ?? "Học sinh"),
            studentEmail: String(s.studentEmail ?? "—"),
            studentAvatar: String(s.studentAvatar ?? ""),
            submittedAt: typeof s.submittedAtMillis === "number" ? Timestamp.fromMillis(s.submittedAtMillis) : null,
            part1Results: Array.isArray(s.part1Results) ? s.part1Results as boolean[] : [],
            part2Results: Array.isArray(s.part2Results) ? s.part2Results as number[] : [],
            part3Results: Array.isArray(s.part3Results) ? s.part3Results as boolean[] : [],
            cheatCount: Number(s.cheatCount ?? 0),
            totalElapsedSeconds: Number(s.totalElapsedSeconds ?? 0),
            idleBeforeSubmitSeconds: Number(s.idleBeforeSubmitSeconds ?? 0),
            p4: typeof (s.scores as { p4?: unknown } | undefined)?.p4 === "number" ? (s.scores as { p4: number }).p4 : null,
            gradingStatus: s.gradingStatus === "pending" || s.gradingStatus === "graded" ? s.gradingStatus : null,
            examCode: typeof s.examCode === "string" ? s.examCode : null,
            studentId: typeof s.studentId === "string" ? s.studentId : null,
            p1Choices: Array.isArray(s.p1Choices) ? s.p1Choices as Array<number | null> : null,
          };
        });
        setSubmissions(subs);
        setClasses(Array.isArray(submissionPayload?.classes) ? submissionPayload.classes : []);
        setP1Correct(Array.isArray(submissionPayload?.p1Correct) ? submissionPayload.p1Correct : []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Lỗi khi tải dữ liệu. Vui lòng thử lại.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [id, classId, authLoading, isMod, isAdmin, user]);

  // ── Group by unique student ──────────────────────────────────────────────────
  const studentRows = useMemo(() => {
    if (!exam || submissions.length === 0) return [];
    return groupSubmissionsByStudent(submissions, exam.scoringConfig);
  }, [exam, submissions]);
  const pendingEssays = submissions.filter((submission) => submission.gradingStatus === "pending").length;

  // ── Bảng và thống kê: mỗi học sinh một dòng (lượt điểm cao nhất) ────────────────
  type TableRow = ResultStudent & { row: StudentRow; classIds: string[] };
  const tableRows = useMemo<TableRow[]>(() => studentRows.map((row) => {
    const base = { studentId: row.bestSub.studentId, email: row.studentEmail };
    return {
      key: row.studentEmail || row.bestSub.id,
      name: row.studentName,
      ...base,
      total: row.bestScore.total,
      p1: row.bestScore.p1,
      p2: row.bestScore.p2,
      p3: row.bestScore.p3,
      part1Results: row.bestSub.part1Results,
      part2Results: row.bestSub.part2Results,
      part3Results: row.bestSub.part3Results,
      p1Choices: row.bestSub.p1Choices,
      pending: row.bestSub.gradingStatus === "pending",
      attempts: row.attempts,
      latestMillis: row.latestSubmittedAt?.toMillis() ?? 0,
      elapsedSeconds: row.bestSub.totalElapsedSeconds ?? 0,
      cheatCount: row.totalCheatCount,
      classIds: classIdsOf(base, classes),
      row,
    };
  }), [studentRows, classes]);
  const classNames = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes]);
  // Lọc theo lớp áp dụng cho cả thống kê lẫn bảng; ô tìm kiếm chỉ thu hẹp bảng.
  const scopedRows = useMemo(() => tableRows.filter((item) => (
    !classFilter || (classFilter === NO_CLASS ? item.classIds.length === 0 : item.classIds.includes(classFilter))
  )), [tableRows, classFilter]);
  const visibleRows = useMemo(
    () => sortStudents(scopedRows.filter((item) => matchesSearch(item, search)), sort.key, sort.direction),
    [scopedRows, search, sort],
  );
  const summary = useMemo(() => scoreSummary(scopedRows), [scopedRows]);
  const stats = useMemo(
    () => (exam ? questionStats(scopedRows, { p1: exam.part1Count, p2: exam.part2Count, p3: exam.part3Count }, p1Correct) : []),
    [exam, scopedRows, p1Correct],
  );
  const breakdown = useMemo(() => classBreakdown(tableRows, classes), [tableRows, classes]);
  const handleSort = (key: SortKey) => setSort((current) => (
    current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "name" ? "asc" : "desc" }
  ));

  // ── Gửi lại email (unchanged logic) ─────────────────────────────────────────
  const handleResendEmail = async (sub: Submission) => {
    if (!exam) return;
    setSendingEmail(sub.id);
    try {
      const scores = calcScores(sub, exam.scoringConfig);
      const P2_TABLE = [0, 0.1, 0.25, 0.5, 1.0];
      void P2_TABLE; // used in email template context

      const detailedResults = [
        ...sub.part1Results.map((isCorrect, i) => ({
          number: i + 1,
          part: "P1" as const,
          isCorrect,
          studentAnswer: "—",
          correctAnswer: "—",
        })),
        ...sub.part2Results.map((hits, i) => ({
          number: sub.part1Results.length + i + 1,
          part: "P2" as const,
          isCorrect: hits === 4,
          partialHits: hits,
          studentAnswer: "—",
          correctAnswer: "—",
        })),
        ...sub.part3Results.map((isCorrect, i) => ({
          number: sub.part1Results.length + sub.part2Results.length + i + 1,
          part: "P3" as const,
          isCorrect,
          studentAnswer: "—",
          correctAnswer: "—",
        })),
      ];

      const token = await user?.getIdToken();
      const res = await fetch("/api/send-result", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          studentEmail: sub.studentEmail,
          studentName: sub.studentName,
          examName: exam.title,
          submissionId: sub.id,
          scores: { p1: scores.p1, p2: scores.p2, p3: scores.p3, total: scores.total },
          detailedResults,
        }),
      });

      if (res.ok) {
        alert(`✓ Đã gửi email kết quả đến ${sub.studentEmail}`);
      } else {
        const data = await res.json();
        alert(`❌ Lỗi: ${data.error ?? "Gửi email thất bại."}`);
      }
    } catch (err) {
      console.error(err);
      alert("❌ Không thể kết nối đến server. Vui lòng thử lại.");
    } finally {
      setSendingEmail(null);
    }
  };

  const handleExtendExam = async () => {
    if (!exam || !newEndTime || !user) return;
    const nextEndTime = toStoredDateTime(newEndTime);
    if (!nextEndTime || new Date(nextEndTime) <= new Date()) {
      alert("Thời gian gia hạn phải nằm trong tương lai.");
      return;
    }
    setExtending(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/exams/${id}/access`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endTime: nextEndTime, passwordAction: "keep" }),
      });
      if (!response.ok) throw new Error("Không thể gia hạn đề thi.");
      setExam((current) => current ? { ...current, endTime: nextEndTime } : current);
      alert("✓ Đã gia hạn thời gian đóng đề.");
    } catch (error) {
      console.error(error);
      alert("❌ Không thể gia hạn đề thi. Vui lòng thử lại.");
    } finally {
      setExtending(false);
    }
  };

  const handleResetSubmissions = async () => {
    if (!studentToReset || !user) return;
    setResetting(true);
    setResetError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/exams/${encodeURIComponent(id)}/submissions${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ studentEmail: studentToReset.studentEmail }),
      });
      const payload = await response.json().catch(() => null) as {
        deletedCount?: number;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Không thể reset bài làm.");
      }

      const normalizedEmail = studentToReset.studentEmail.trim().toLowerCase();
      setSubmissions((current) => current.filter(
        (submission) => submission.studentEmail.trim().toLowerCase() !== normalizedEmail,
      ));
      setResetNotice(
        `Đã reset ${payload?.deletedCount ?? studentToReset.attempts} lượt làm bài của ${studentToReset.studentName}.`,
      );
      setStudentToReset(null);
    } catch (resetFailure) {
      console.error(resetFailure);
      setResetError("Không thể reset bài làm. Vui lòng tải lại trang và thử lại.");
    } finally {
      setResetting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminGuard>
        <div className="max-w-6xl mx-auto px-4 py-12">
          <Spinner />
        </div>
      </AdminGuard>
    );
  }

  if (error || !exam) {
    return (
      <AdminGuard>
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <p className="text-danger-500 font-medium text-lg">{error ?? "Không tìm thấy bài thi."}</p>
          <Link href="/admin/dashboard" className="mt-4 inline-block text-brand-600 underline">
            ← Quay lại Dashboard
          </Link>
        </div>
      </AdminGuard>
    );
  }

  const { scoringConfig } = exam;

  return (
    <AdminGuard>
      <div className="workspace-page max-w-6xl mx-auto px-4 py-8 sm:py-10 w-full">
        {/* Back */}
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 transition-colors mb-6"
        >
          ← Quay lại Dashboard
        </Link>

        {/* Title */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">{exam.title}</h1>
            <p className="text-gray-500 mt-1">Chi tiết kết quả làm bài của học sinh.</p>
          </div>
          {exam.hasEssay && (
            <Link
              href={`/admin/grade/${id}`}
              className="edu-btn inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
            >
              <PenTool size={16} aria-hidden="true" />Chấm tự luận
              {pendingEssays > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{pendingEssays} chờ chấm</span>}
            </Link>
          )}
          {exam.hasVersions && (
            <Link
              href={`/admin/exam/${id}/ma-de`}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50"
            >
              <Shuffle size={16} aria-hidden="true" />Mã đề &amp; đáp án
            </Link>
          )}
          <Link
            href={`/admin/exam/${id}/review`}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50"
          >
            Xem toàn bộ đề →
          </Link>
        </div>

        <div className="mb-8 rounded-3xl border border-brand-100 bg-brand-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Khung thời gian mở đề</p>
              <p className="mt-1 text-sm text-gray-600">
                Mở: <strong>{exam.startTime ? new Date(exam.startTime).toLocaleString("vi-VN") : "Ngay lập tức"}</strong>
                {" · "}Đóng: <strong>{exam.endTime ? new Date(exam.endTime).toLocaleString("vi-VN") : "Không giới hạn"}</strong>
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="datetime-local"
                value={newEndTime}
                onChange={(event) => setNewEndTime(event.target.value)}
                className="rounded-xl border-2 border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
                aria-label="Thời gian đóng đề mới"
              />
              <button
                type="button"
                onClick={handleExtendExam}
                disabled={!newEndTime || extending}
                className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {extending ? "Đang gia hạn…" : "Gia hạn đề"}
              </button>
            </div>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-10">
          {[
            { label: "Câu P1", value: exam.part1Count, color: "bg-brand-50 border-brand-100 text-brand-700" },
            { label: "Câu P2", value: exam.part2Count, color: "bg-amber-50 border-amber-100 text-amber-700" },
            { label: "Câu P3", value: exam.part3Count, color: "bg-success-50 border-success-100 text-success-700" },
            { label: "Học sinh", value: studentRows.length, color: "bg-brand-50 border-brand-100 text-brand-700" },
            { label: "Tổng lượt nộp", value: submissions.length, color: "bg-brand-50 border-brand-100 text-brand-700" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-2xl border p-4 text-center ${color}`}>
              <p className="text-3xl font-extrabold">{value}</p>
              <p className="text-xs font-semibold opacity-70 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Thống kê ───────────────────────────────────────────────────────── */}
        {tableRows.length > 0 && (classes.length > 0 && !classId) && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-gray-500">Đang xem:</span>
            {[{ id: "", name: "Tất cả lớp" }, ...classes].map((item) => (
              <button
                key={item.id || "all"}
                type="button"
                onClick={() => setClassFilter(item.id)}
                aria-pressed={classFilter === item.id}
                className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${classFilter === item.id ? "bg-brand-600 text-white shadow-sm" : "border border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-700"}`}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        {summary.count > 0 && (
          <ResultAnalytics
            summary={summary}
            stats={stats}
            scopeLabel={`${summary.count} học sinh${classFilter && classFilter !== NO_CLASS ? ` · ${classNames.get(classFilter) ?? ""}` : ""}`}
            parts={[
              { label: "Phần I", count: exam.part1Count, average: summary.p1, max: scoringConfig.part1TotalScore, tone: "text-brand-700", bar: "bg-brand-400" },
              { label: "Phần II", count: exam.part2Count, average: summary.p2, max: exam.part2Count, tone: "text-amber-700", bar: "bg-amber-400" },
              { label: "Phần III", count: exam.part3Count, average: summary.p3, max: scoringConfig.part3TotalScore, tone: "text-success-700", bar: "bg-success-400" },
            ].filter((part) => part.count > 0)}
          />
        )}
        {summary.count > 0 && <QuestionBreakdown stats={stats} p1Correct={p1Correct} />}
        <ClassPanels breakdown={breakdown} classFilter={classFilter} onClass={setClassFilter} lockedClass={Boolean(classId)} />

        {/* Scoring rule reminder */}
        <div className="mb-8 bg-gradient-to-r from-brand-50 to-brand-50 border border-brand-100 rounded-2xl p-5 flex flex-wrap gap-6 text-sm">
          {exam.part1Count + exam.part2Count + exam.part3Count > 0 && (<>
          <div>
            <span className="font-bold text-brand-700">P1 tổng điểm: </span>
            <span className="text-gray-700">{scoringConfig.part1TotalScore} đ</span>
          </div>
          <div>
            <span className="font-bold text-amber-700">P2: </span>
            <span className="text-gray-700">0.1 / 0.25 / 0.5 / 1.0 đ (cố định)</span>
          </div>
          <div>
            <span className="font-bold text-success-700">P3 tổng điểm: </span>
            <span className="text-gray-700">{scoringConfig.part3TotalScore} đ</span>
          </div>
          </>)}
          {exam.hasEssay && (
            <div>
              <span className="font-bold text-violet-700">P4 tự luận (giáo viên chấm): </span>
              <span className="text-gray-700">
                {exam.part4TotalScore} đ
                {exam.essayPoints.length > 0 && ` — ${exam.essayPoints.map((item) => `Câu ${item.number}: ${item.points} đ`).join(" · ")}`}
              </span>
            </div>
          )}
        </div>

        {/* ── Results table — one row per unique student ─────────────────────── */}
        {resetNotice && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-success-200 bg-success-50 px-5 py-4 text-sm font-bold text-success-800" role="status">
            <span>{resetNotice}</span>
            <button type="button" onClick={() => setResetNotice("")} className="shrink-0 text-success-700 hover:text-success-950" aria-label="Đóng thông báo">
              <X size={17} />
            </button>
          </div>
        )}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-bold text-gray-800">Danh sách học sinh đã nộp bài</h2>
              <p className="mt-0.5 text-sm text-gray-400">
                <span className="font-semibold text-brand-600">
                  {visibleRows.length === studentRows.length ? `${studentRows.length} học sinh` : `${visibleRows.length}/${studentRows.length} học sinh`}
                </span>
                {" · "}{submissions.length} lượt nộp · bấm tiêu đề cột để sắp xếp
              </p>
            </div>
            {studentRows.length > 0 && (
              <ResultFilters classes={classes} classFilter={classFilter} onClass={setClassFilter} lockedClass={Boolean(classId)} search={search} onSearch={setSearch} />
            )}
          </div>

          {studentRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center text-gray-400">
              <StateIcon icon="inbox" />
              <p>Chưa có học sinh nào nộp bài cho bài thi này.</p>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-gray-500">
              Không có học sinh nào khớp bộ lọc.{" "}
              <button type="button" onClick={() => { setSearch(""); setClassFilter(""); }} className="font-bold text-brand-700 hover:underline">Bỏ lọc</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th scope="col" className="w-10 py-3 pl-5 pr-1 text-center font-semibold uppercase tracking-wider">#</th>
                    <SortHeader label="Học sinh" sortKey="name" sort={sort} onSort={handleSort} align="left" />
                    {classes.length > 0 && <th scope="col" className="px-2 py-3 text-left font-semibold uppercase tracking-wider">Lớp</th>}
                    <SortHeader label="Lần" sortKey="attempts" sort={sort} onSort={handleSort} />
                    <SortHeader label="P1" sortKey="p1" sort={sort} onSort={handleSort} />
                    <SortHeader label="P2" sortKey="p2" sort={sort} onSort={handleSort} />
                    <SortHeader label="P3" sortKey="p3" sort={sort} onSort={handleSort} />
                    <SortHeader label="Điểm" sortKey="total" sort={sort} onSort={handleSort} />
                    <SortHeader label="Nộp lúc" sortKey="latest" sort={sort} onSort={handleSort} align="left" />
                    <SortHeader label="Làm trong" sortKey="elapsed" sort={sort} onSort={handleSort} />
                    <SortHeader label="Gian lận" sortKey="cheat" sort={sort} onSort={handleSort} />
                    <th scope="col" className="sticky right-0 bg-gray-50 py-3 pl-2 pr-5 text-right font-semibold uppercase tracking-wider">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRows.map(({ row, classIds }, i) => (
                    <tr key={row.studentEmail || row.bestSub.id} className={`transition-colors hover:bg-brand-50/30 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                      <td className="py-3 pl-5 pr-1 text-center text-xs tabular-nums text-gray-400">{i + 1}</td>

                      {/* Ảnh + tên + email gộp một ô để tên không bị bẻ thành nhiều dòng */}
                      <td className="px-2 py-3">
                        <div className="flex min-w-48 items-center gap-3">
                          {row.studentAvatar ? (
                            <img src={row.studentAvatar} alt="" className="h-8 w-8 shrink-0 rounded-full border border-gray-200 object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600">
                              {row.studentName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-semibold text-gray-900">
                              <span className="truncate">{row.studentName}</span>
                              {row.bestSub.examCode && <span title="Mã đề của lượt điểm cao nhất" className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">{row.bestSub.examCode}</span>}
                            </p>
                            <p className="truncate text-xs text-gray-500">{row.studentEmail}</p>
                          </div>
                        </div>
                      </td>

                      {classes.length > 0 && (
                        <td className="px-2 py-3">
                          {classIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {classIds.map((value) => (
                                <span key={value} className="whitespace-nowrap rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{classNames.get(value)}</span>
                              ))}
                            </div>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                      )}

                      <td className="px-2 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${row.attempts > 1 ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}>{row.attempts}</span>
                      </td>
                      <td className="px-2 py-3 text-center font-bold tabular-nums text-brand-700">{row.bestScore.p1}</td>
                      <td className="px-2 py-3 text-center font-bold tabular-nums text-amber-700">{row.bestScore.p2}</td>
                      <td className="px-2 py-3 text-center font-bold tabular-nums text-success-700">{row.bestScore.p3}</td>
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-block rounded-lg px-2.5 py-1 text-base font-extrabold tabular-nums ${
                          row.bestScore.total >= 8 ? "bg-success-100 text-success-700" : row.bestScore.total >= 5 ? "bg-yellow-100 text-yellow-700" : "bg-danger-100 text-danger-700"
                        }`}>
                          {row.bestScore.total}
                        </span>
                        {row.bestSub.gradingStatus === "pending" && <span className="mt-1 block text-[10px] font-bold text-violet-700">Tự luận chờ chấm</span>}
                      </td>

                      <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500">{formatDateTime(row.latestSubmittedAt)}</td>

                      <td className="px-2 py-3 text-center text-xs">
                        {row.bestSub.totalElapsedSeconds ? (
                          <div>
                            <p className="font-bold tabular-nums text-earth">{formatCountdown(row.bestSub.totalElapsedSeconds)}</p>
                            {(row.bestSub.idleBeforeSubmitSeconds ?? 0) >= 300 && (
                              <p className="mt-0.5 font-semibold text-danger-600">nghỉ {formatCountdown(row.bestSub.idleBeforeSubmitSeconds ?? 0)}</p>
                            )}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>

                      <td className="px-2 py-3 text-center">
                        {row.totalCheatCount > 0 ? (
                          <span className="whitespace-nowrap rounded-full bg-danger-50 px-2 py-0.5 text-xs font-bold text-danger-600">
                            {row.totalCheatCount} <AlertTriangle size={12} className="inline align-[-1px]" aria-hidden="true" />
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>

                      <td className={`sticky right-0 py-3 pl-2 pr-5 shadow-[-8px_0_8px_-8px_rgba(16,24,40,0.12)] ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/teacher/review/${row.bestSub.id}?returnTo=${encodeURIComponent(`/admin/exam/${id}`)}`}
                            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50"
                          >
                            Nhật ký
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleResendEmail(row.bestSub)}
                            disabled={sendingEmail === row.bestSub.id}
                            title={`Gửi lại email kết quả đến ${row.studentEmail}`}
                            aria-label={`Gửi lại email kết quả cho ${row.studentName}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 text-brand-600 transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {sendingEmail === row.bestSub.id
                              ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
                              : <Mail size={14} aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setResetError(""); setStudentToReset(row); }}
                            title="Xoá các lượt làm để học sinh làm lại"
                            aria-label={`Reset bài của ${row.studentName}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-danger-200 bg-danger-50/60 text-danger-700 transition hover:border-danger-400 hover:bg-danger-50"
                          >
                            <RotateCcw size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {studentToReset && (
          <ResetSubmissionDialog
            student={studentToReset}
            busy={resetting}
            error={resetError}
            onCancel={() => {
              if (resetting) return;
              setStudentToReset(null);
              setResetError("");
            }}
            onConfirm={handleResetSubmissions}
          />
        )}
      </div>
    </AdminGuard>
  );
}
