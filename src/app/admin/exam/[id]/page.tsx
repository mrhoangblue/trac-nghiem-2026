"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import AdminGuard from "@/components/AdminGuard";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";

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
}

interface Submission {
  id: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string;
  submittedAt: Timestamp | null;
  part1Results: boolean[];  // correct for each MC question
  part2Results: number[];   // count of correctly-answered statements per TF question (0-4)
  part3Results: boolean[];  // correct for each short answer
  cheatCount?: number;
}

interface ScoreBreakdown {
  p1: number;
  p2: number;
  p3: number;
  total: number;
}

// ── Scoring Utilities ─────────────────────────────────────────────────────────

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
  return { p1, p2, p3, total: Math.round((p1 + p2 + p3) * 100) / 100 };
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
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải dữ liệu…</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [exam, setExam] = useState<ExamData | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null); // submissionId đang gửi

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
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
          scoringConfig: d.scoringConfig ?? { part1TotalScore: 3, part3TotalScore: 1 },
        };
        setExam(examData);

        // 2. Fetch submissions for this exam
        const subSnap = await getDocs(
          query(collection(db, "submissions"), where("examId", "==", id))
        );
        const subs: Submission[] = subSnap.docs.map((sdoc) => {
          const s = sdoc.data();
          return {
            id: sdoc.id,
            studentName: s.studentName ?? "Học sinh",
            studentEmail: s.studentEmail ?? "—",
            studentAvatar: s.studentAvatar ?? "",
            submittedAt: s.submittedAt ?? null,
            part1Results: s.part1Results ?? [],
            part2Results: s.part2Results ?? [],
            part3Results: s.part3Results ?? [],
            cheatCount: s.cheatCount ?? 0,
          };
        });
        setSubmissions(subs);
      } catch (err) {
        console.error(err);
        setError("Lỗi khi tải dữ liệu. Vui lòng thử lại.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // ── Gửi lại email cho một submission ────────────────────────────────────────
  const handleResendEmail = async (sub: Submission) => {
    if (!exam) return;
    setSendingEmail(sub.id);
    try {
      const scores = calcScores(sub, exam.scoringConfig);
      const P2_TABLE = [0, 0.1, 0.25, 0.5, 1.0];

      const detailedResults = [
        ...sub.part1Results.map((isCorrect, i) => ({
          number: i + 1,
          part: "P1" as const,
          isCorrect,
          studentAnswer: isCorrect ? "Đúng" : "Sai",
          correctAnswer: "—",
        })),
        ...sub.part2Results.map((hits, i) => ({
          number: sub.part1Results.length + i + 1,
          part: "P2" as const,
          isCorrect: hits === 4,
          partialHits: hits,
          studentAnswer: `${hits}/4 ý đúng`,
          correctAnswer: "4/4 ý đúng",
        })),
        ...sub.part3Results.map((isCorrect, i) => ({
          number: sub.part1Results.length + sub.part2Results.length + i + 1,
          part: "P3" as const,
          isCorrect,
          studentAnswer: isCorrect ? "Đúng" : "Sai",
          correctAnswer: "—",
        })),
      ];

      const res = await fetch("/api/send-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        alert(`✅ Đã gửi email kết quả đến ${sub.studentEmail}`);
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

  // ── Analytics (must be before any early return — Rules of Hooks) ────────────
  const analytics = useMemo(() => {
    if (!exam || submissions.length === 0) return null;
    const { scoringConfig: cfg } = exam;
    const n = submissions.length;
    const allScores = submissions.map((s) => calcScores(s, cfg).total);

    const avg = allScores.reduce((a, b) => a + b, 0) / n;
    const dist = { high: 0, mid: 0, low: 0 };
    allScores.forEach((s) => {
      if (s >= 8) dist.high++;
      else if (s >= 5) dist.mid++;
      else dist.low++;
    });

    const wrong: { label: string; part: string; wrongCount: number; rate: number }[] = [];
    for (let i = 0; i < exam.part1Count; i++) {
      const w = submissions.filter((s) => !(s.part1Results[i] ?? false)).length;
      wrong.push({ label: `Câu ${i + 1}`, part: "P1", wrongCount: w, rate: w / n });
    }
    for (let i = 0; i < exam.part2Count; i++) {
      const w = submissions.filter((s) => (s.part2Results[i] ?? 0) < 4).length;
      wrong.push({ label: `Câu ${exam.part1Count + i + 1}`, part: "P2", wrongCount: w, rate: w / n });
    }
    for (let i = 0; i < exam.part3Count; i++) {
      const w = submissions.filter((s) => !(s.part3Results[i] ?? false)).length;
      wrong.push({ label: `Câu ${exam.part1Count + exam.part2Count + i + 1}`, part: "P3", wrongCount: w, rate: w / n });
    }
    const top3 = [...wrong].sort((a, b) => b.rate - a.rate).slice(0, 3);

    return { avg: Math.round(avg * 100) / 100, dist, top3, n };
  }, [exam, submissions]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <Spinner />
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
        <p className="text-red-500 font-medium text-lg">{error ?? "Không tìm thấy bài thi."}</p>
        <Link href="/admin/dashboard" className="mt-4 inline-block text-blue-600 underline">
          ← Quay lại Dashboard
        </Link>
      </div>
    );
  }

  const { scoringConfig } = exam;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 w-full">
      {/* Back */}
      <Link
        href="/admin/dashboard"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors mb-6"
      >
        ← Quay lại Dashboard
      </Link>

      {/* Title */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">{exam.title}</h1>
        <p className="text-gray-500 mt-1">Chi tiết kết quả làm bài của học sinh.</p>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Câu P1", value: exam.part1Count, color: "bg-blue-50 border-blue-100 text-blue-700" },
          { label: "Câu P2", value: exam.part2Count, color: "bg-amber-50 border-amber-100 text-amber-700" },
          { label: "Câu P3", value: exam.part3Count, color: "bg-emerald-50 border-emerald-100 text-emerald-700" },
          { label: "Lượt nộp", value: submissions.length, color: "bg-purple-50 border-purple-100 text-purple-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border p-4 text-center ${color}`}>
            <p className="text-3xl font-extrabold">{value}</p>
            <p className="text-xs font-semibold opacity-70 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Analytics ──────────────────────────────────────────────────────── */}
      {analytics && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score overview */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-extrabold text-gray-800 mb-4 flex items-center gap-2">
              <span className="text-blue-500">📊</span> Phổ điểm
            </h2>
            <div className="flex items-center gap-4 mb-5">
              <div className="text-center">
                <p className="text-4xl font-extrabold text-blue-700">{analytics.avg}</p>
                <p className="text-xs text-gray-400 mt-1">Điểm trung bình</p>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-green-50 border border-green-100 rounded-xl py-3">
                  <p className="text-xl font-extrabold text-green-700">{analytics.dist.high}</p>
                  <p className="text-xs text-green-600 font-medium mt-0.5">Giỏi (≥8)</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-xl py-3">
                  <p className="text-xl font-extrabold text-yellow-700">{analytics.dist.mid}</p>
                  <p className="text-xs text-yellow-600 font-medium mt-0.5">TB (5-8)</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl py-3">
                  <p className="text-xl font-extrabold text-red-700">{analytics.dist.low}</p>
                  <p className="text-xs text-red-600 font-medium mt-0.5">Yếu (&lt;5)</p>
                </div>
              </div>
            </div>
            {/* Score bar */}
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
              {analytics.n > 0 && (
                <>
                  <div
                    className="bg-green-400 h-full transition-all"
                    style={{ width: `${(analytics.dist.high / analytics.n) * 100}%` }}
                  />
                  <div
                    className="bg-yellow-400 h-full transition-all"
                    style={{ width: `${(analytics.dist.mid / analytics.n) * 100}%` }}
                  />
                  <div
                    className="bg-red-400 h-full transition-all"
                    style={{ width: `${(analytics.dist.low / analytics.n) * 100}%` }}
                  />
                </>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2 text-right">
              Tổng: {analytics.n} học sinh
            </p>
          </div>

          {/* Killer questions */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-extrabold text-gray-800 mb-4 flex items-center gap-2">
              <span className="text-red-500">🎯</span> Top 3 câu hỏi sát thủ
            </h2>
            {analytics.top3.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa đủ dữ liệu.</p>
            ) : (
              <div className="space-y-3">
                {analytics.top3.map((q, i) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const pct = Math.round(q.rate * 100);
                  return (
                    <div key={q.label} className="flex items-center gap-3">
                      <span className="text-xl w-7 shrink-0">{medals[i]}</span>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-gray-800 text-sm">
                            {q.label}
                            <span className="ml-1.5 text-xs font-semibold text-gray-400">
                              ({q.part})
                            </span>
                          </span>
                          <span className="text-sm font-extrabold text-red-600">
                            {pct}% sai
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="bg-red-400 h-full rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {q.wrongCount}/{analytics.n} học sinh làm sai
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scoring rule reminder */}
      <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 flex flex-wrap gap-6 text-sm">
        <div>
          <span className="font-bold text-blue-700">P1 tổng điểm: </span>
          <span className="text-gray-700">{scoringConfig.part1TotalScore} đ</span>
        </div>
        <div>
          <span className="font-bold text-amber-700">P2: </span>
          <span className="text-gray-700">0.1 / 0.25 / 0.5 / 1.0 đ (cố định)</span>
        </div>
        <div>
          <span className="font-bold text-emerald-700">P3 tổng điểm: </span>
          <span className="text-gray-700">{scoringConfig.part3TotalScore} đ</span>
        </div>
      </div>

      {/* Submissions table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Danh sách học sinh đã nộp bài</h2>
          <span className="text-sm text-gray-400">{submissions.length} học sinh</span>
        </div>

        {submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center text-gray-400">
            <span className="text-5xl">📭</span>
            <p>Chưa có học sinh nào nộp bài cho bài thi này.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-semibold">Học sinh</th>
                  <th className="text-left px-6 py-3 font-semibold">Email</th>
                  <th className="text-left px-6 py-3 font-semibold">Thời gian nộp</th>
                  <th className="text-center px-4 py-3 font-semibold">Điểm P1</th>
                  <th className="text-center px-4 py-3 font-semibold">Điểm P2</th>
                  <th className="text-center px-4 py-3 font-semibold">Điểm P3</th>
                  <th className="text-center px-4 py-3 font-semibold">Tổng</th>
                  <th className="text-center px-4 py-3 font-semibold">Gian lận</th>
                  <th className="text-center px-4 py-3 font-semibold">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {submissions.map((sub, i) => {
                  const scores = calcScores(sub, scoringConfig);
                  return (
                    <tr
                      key={sub.id}
                      className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      {/* Avatar + Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {sub.studentAvatar ? (
                            <img
                              src={sub.studentAvatar}
                              alt={sub.studentName}
                              className="w-8 h-8 rounded-full object-cover border border-gray-200"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                              {sub.studentName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-semibold text-gray-900">{sub.studentName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{sub.studentEmail}</td>
                      <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                        {formatDateTime(sub.submittedAt)}
                      </td>

                      {/* Score cells */}
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-blue-700">{scores.p1}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-amber-700">{scores.p2}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-emerald-700">{scores.p3}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`font-extrabold text-base px-3 py-1 rounded-lg ${
                            scores.total >= 8
                              ? "bg-green-100 text-green-700"
                              : scores.total >= 5
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {scores.total}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {(sub.cheatCount ?? 0) > 0 ? (
                          <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs">
                            {sub.cheatCount}x ⚠️
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => handleResendEmail(sub)}
                          disabled={sendingEmail === sub.id}
                          title={`Gửi email kết quả đến ${sub.studentEmail}`}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sendingEmail === sub.id ? (
                            <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            "📧"
                          )}
                          {sendingEmail === sub.id ? "Đang gửi…" : "Gửi lại"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
