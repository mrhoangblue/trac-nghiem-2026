"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Latex from "react-latex-next";
import "katex/dist/katex.min.css";
import { processLatexText } from "@/utils/textProcessor";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import AdminGuard from "@/components/AdminGuard";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";
import TikzRenderer from "@/components/TikzRenderer";
import { useAuth } from "@/lib/AuthContext";
import { GRADE_LEVELS, EXAM_TYPES } from "@/components/Sidebar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoringConfig {
  part1TotalScore: number;
  part3TotalScore: number;
}

interface PreviewData {
  title: string;
  questions: ParsedQuestion[];
}

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      {label && <p className="text-gray-500 text-sm animate-pulse">{label}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EditExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // LaTeX parts
  const [examTitle, setExamTitle] = useState("");
  const [part1, setPart1] = useState("");
  const [part2, setPart2] = useState("");
  const [part3, setPart3] = useState("");

  // Scoring / timing
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig>({
    part1TotalScore: 3,
    part3TotalScore: 1,
  });
  const [duration, setDuration] = useState(90);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // ── New fields ─────────────────────────────────────────────────────────────
  const [maxRetries, setMaxRetries] = useState(1);
  const [isShared, setIsShared] = useState(false);
  const [gradeLevel, setGradeLevel] = useState<string>(GRADE_LEVELS[0]);
  const [examType, setExamType] = useState<string>(EXAM_TYPES[0]);
  const [originalAuthorEmail, setOriginalAuthorEmail] = useState<string>("");

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  // ── Load from Firestore ───────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "exams", id));
        if (!snap.exists()) { setLoadError("Không tìm thấy bài thi."); return; }
        const data = snap.data();

        setExamTitle(data.title ?? "");
        setScoringConfig(data.scoringConfig ?? { part1TotalScore: 3, part3TotalScore: 1 });
        setDuration(data.duration ?? 90);
        setStartTime(data.startTime ?? "");
        setEndTime(data.endTime ?? "");
        setMaxRetries(data.maxRetries ?? 1);
        setIsShared(data.isShared ?? false);
        setGradeLevel(data.gradeLevel ?? GRADE_LEVELS[0]);
        setExamType(data.examType ?? EXAM_TYPES[0]);
        setOriginalAuthorEmail(data.authorEmail ?? "");

        if (data.rawLatex) {
          setPart1(data.rawLatex.part1 ?? "");
          setPart2(data.rawLatex.part2 ?? "");
          setPart3(data.rawLatex.part3 ?? "");
        } else {
          setLoadError(
            "Bài thi này chưa có rawLatex (tạo trước khi tính năng Sửa ra mắt). Vui lòng tạo lại đề mới."
          );
        }
      } catch (err) {
        console.error(err);
        setLoadError("Lỗi khi tải bài thi. Vui lòng thử lại.");
      } finally {
        setPageLoading(false);
      }
    };
    load();
  }, [id]);

  // ── Compile preview ───────────────────────────────────────────────────────
  const handlePreview = () => {
    if (!examTitle.trim()) { alert("Vui lòng nhập tên bài thi!"); return; }
    try {
      const all = [
        ...parseLatexExam(part1),
        ...parseLatexExam(part2),
        ...parseLatexExam(part3),
      ].map((q, idx) => ({ ...q, id: idx + 1 }));
      setPreviewData({ title: examTitle, questions: all });
    } catch (err) {
      console.error(err);
      alert("Có lỗi khi biên dịch LaTeX. Vui lòng kiểm tra lại cú pháp.");
    }
  };

  // ── Save: update own exam OR clone shared exam ────────────────────────────
  const handleUpdate = async () => {
    if (!previewData) {
      alert("Vui lòng biên dịch trước khi cập nhật.");
      return;
    }

    const p1Qs = previewData.questions.filter((q) => q.type === "multiple_choice");
    const p2Qs = previewData.questions.filter((q) => q.type === "true_false");
    const p3Qs = previewData.questions.filter((q) => q.type === "short_answer");

    const examPayload = {
      title: previewData.title,
      questions: previewData.questions,
      questionCount: previewData.questions.length,
      part1Count: p1Qs.length,
      part2Count: p2Qs.length,
      part3Count: p3Qs.length,
      scoringConfig: {
        part1TotalScore: Number(scoringConfig.part1TotalScore),
        part3TotalScore: Number(scoringConfig.part3TotalScore),
      },
      duration: Number(duration),
      startTime: startTime || null,
      endTime: endTime || null,
      rawLatex: { part1, part2, part3 },
      maxRetries: Number(maxRetries),
      gradeLevel,
      examType: gradeLevel === "Thi Thử TN THPT" ? null : examType,
    };

    // Determine if this is someone else's exam (clone operation)
    const isOwnExam = !originalAuthorEmail || originalAuthorEmail === user?.email;

    setSaving(true);
    try {
      if (!isOwnExam) {
        // ── CLONE: tạo document mới, không ghi đè đề gốc ─────────────────
        if (!window.confirm(
          "Đây là đề của giáo viên khác.\nHệ thống sẽ TẠO BẢN SAO mới và gán cho bạn (đề gốc không bị thay đổi).\n\nTiếp tục?"
        )) { setSaving(false); return; }

        await addDoc(collection(db, "exams"), {
          ...examPayload,
          authorEmail: user?.email ?? "",
          isClonedFromShared: true,
          isShared: false,
          createdAt: serverTimestamp(),
        });

        alert("✅ Bản sao đã được tạo và thêm vào kho 'Đề được chia sẻ' của bạn!");
        router.push("/admin/exam-list?tab=shared");
      } else {
        // ── UPDATE: ghi đè đề của chính mình ────────────────────────────
        if (!window.confirm("Bạn có chắc muốn LƯU ĐÈ bài thi này không?")) {
          setSaving(false);
          return;
        }

        await updateDoc(doc(db, "exams", id), {
          ...examPayload,
          authorEmail: user?.email ?? originalAuthorEmail,
          isShared,
          updatedAt: serverTimestamp(),
        });

        alert("✅ Cập nhật bài thi thành công!");
        router.push("/admin/exam-list?tab=mine");
      }
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi khi lưu. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <Spinner label="Đang tải bài thi…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 font-semibold text-lg mb-6">{loadError}</p>
        <Link href="/admin/exam-list" className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors">
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  const isOwnExam = !originalAuthorEmail || originalAuthorEmail === user?.email;

  return (
    <AdminGuard>
      <div className="max-w-6xl mx-auto px-4 py-12 w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/admin/exam-list" className="text-sm text-gray-400 hover:text-blue-600 transition-colors mb-2 inline-block">
              ← Quay lại danh sách
            </Link>
            <h1 className="text-3xl font-extrabold text-gray-900">Chỉnh sửa bài thi</h1>
            <p className="text-gray-500 mt-1 text-sm font-mono opacity-60">{id}</p>
            {!isOwnExam && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                ⚠️ Đây là đề của giáo viên khác — lưu sẽ tạo bản sao cho bạn.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* ── Editor ─────────────────────────────────────────────────── */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6">
            {/* Tên */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Tên bài thi</label>
              <input
                type="text"
                className="w-full p-4 border-2 border-gray-200 rounded-xl font-medium focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
              />
            </div>

            {/* ── Phân loại đề ────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-100 rounded-2xl p-5 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-sky-500">🗂️</span> Phân loại đề thi
              </h3>
              <div>
                <label className="text-sm font-semibold text-gray-600 mb-2 block">Cấp học</label>
                <div className="grid grid-cols-2 gap-2">
                  {GRADE_LEVELS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGradeLevel(g)}
                      className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                        gradeLevel === g
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {gradeLevel !== "Thi Thử TN THPT" && (
                <div>
                  <label className="text-sm font-semibold text-gray-600 mb-2 block">Loại đề</label>
                  <div className="space-y-1.5">
                    {EXAM_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setExamType(t)}
                        className={`w-full text-left py-2 px-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                          examType === t
                            ? "border-sky-400 bg-sky-50 text-sky-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Cấu hình làm bài ────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-100 rounded-2xl p-5 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-rose-500">⚙️</span> Cấu hình làm bài
              </h3>
              <div className="bg-white rounded-xl border border-rose-100 p-4">
                <label className="text-sm font-bold text-gray-700 block mb-2">Số lần làm lại</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={0}
                    className="w-24 p-2 border-2 border-rose-200 rounded-lg text-center font-bold text-rose-700 focus:border-rose-500 outline-none"
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value) || 0)}
                  />
                  <span className="text-sm text-gray-500">lần</span>
                </div>
                <p className="text-xs text-gray-400 italic mt-1.5">💡 <strong>0</strong> = không giới hạn.</p>
              </div>

              {/* isShared — chỉ hiện nếu là tác giả */}
              {isOwnExam && (
                <div className="bg-white rounded-xl border border-rose-100 p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setIsShared(!isShared)}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${isShared ? "bg-blue-500" : "bg-gray-300"}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isShared ? "translate-x-5" : ""}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-700">Chia sẻ đề thi</p>
                      <p className="text-xs text-gray-400">
                        {isShared ? "Giáo viên khác có thể nhân bản đề này." : "Chỉ bạn mới thấy đề này."}
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* LaTeX textareas */}
            <div className="space-y-6">
              {([
                { label: "Phần 1: Trắc nghiệm nhiều phương án (\\choice)", value: part1, set: setPart1 },
                { label: "Phần 2: Trắc nghiệm Đúng/Sai (\\choiceTF)",    value: part2, set: setPart2 },
                { label: "Phần 3: Trả lời ngắn (\\shortans)",              value: part3, set: setPart3 },
              ] as { label: string; value: string; set: (v: string) => void }[]).map(({ label, value, set }) => (
                <div key={label}>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{label}</label>
                  <textarea
                    className="w-full h-40 p-4 border-2 border-gray-200 rounded-xl font-mono text-sm focus:border-blue-500 outline-none transition-all resize-y"
                    placeholder="\begin{ex}...\end{ex}"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>

            {/* Điểm số */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 space-y-5">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-blue-500">🎯</span> Thiết lập điểm số
              </h3>
              <div className="bg-white rounded-xl border border-blue-100 p-4 space-y-2">
                <p className="text-sm font-bold text-gray-700">Phần 1 — Trắc nghiệm 1 đáp án</p>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">Tổng điểm:</label>
                  <input type="number" min={0} step={0.5}
                    className="w-24 p-2 border-2 border-blue-200 rounded-lg text-center font-bold text-blue-700 focus:border-blue-500 outline-none"
                    value={scoringConfig.part1TotalScore}
                    onChange={(e) => setScoringConfig((s) => ({ ...s, part1TotalScore: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="text-sm text-gray-500">điểm</span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-amber-100 p-4 space-y-2">
                <p className="text-sm font-bold text-gray-700">Phần 2 — Đúng/Sai (luật cố định)</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[{ label: "1 ý đúng", score: "0.10 đ" }, { label: "2 ý đúng", score: "0.25 đ" }, { label: "3 ý đúng", score: "0.50 đ" }, { label: "4 ý đúng", score: "1.00 đ" }].map(({ label, score }) => (
                    <div key={label} className="flex justify-between items-center bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-bold text-amber-700">{score}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-blue-100 p-4 space-y-2">
                <p className="text-sm font-bold text-gray-700">Phần 3 — Trả lời ngắn</p>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">Tổng điểm:</label>
                  <input type="number" min={0} step={0.5}
                    className="w-24 p-2 border-2 border-blue-200 rounded-lg text-center font-bold text-blue-700 focus:border-blue-500 outline-none"
                    value={scoringConfig.part3TotalScore}
                    onChange={(e) => setScoringConfig((s) => ({ ...s, part3TotalScore: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="text-sm text-gray-500">điểm</span>
                </div>
              </div>
            </div>

            {/* Thời gian */}
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-6 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-violet-500">⏱</span> Cấu hình thời gian
              </h3>
              <div className="bg-white rounded-xl border border-violet-100 p-4">
                <p className="text-sm font-bold text-gray-700 mb-2">Thời gian làm bài</p>
                <div className="flex items-center gap-3">
                  <input type="number" min={1} max={300}
                    className="w-24 p-2 border-2 border-violet-200 rounded-lg text-center font-bold text-violet-700 focus:border-violet-500 outline-none"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 90)}
                  />
                  <span className="text-sm text-gray-500">phút</span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-violet-100 p-4 space-y-3">
                <p className="text-sm font-bold text-gray-700">Khung thời gian</p>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Mở đề từ <span className="font-normal text-gray-400">(bỏ trống = mở ngay)</span></label>
                  <input type="datetime-local"
                    className="w-full p-2.5 border-2 border-violet-200 rounded-lg text-sm focus:border-violet-500 outline-none transition-all"
                    value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Đóng đề lúc <span className="font-normal text-gray-400">(bỏ trống = không giới hạn)</span></label>
                  <input type="datetime-local"
                    className="w-full p-2.5 border-2 border-violet-200 rounded-lg text-sm focus:border-violet-500 outline-none transition-all"
                    value={endTime} onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handlePreview}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-all hover:-translate-y-0.5"
              >
                🔄 Biên dịch lại
              </button>
              <button
                onClick={handleUpdate}
                disabled={saving || !previewData}
                className="flex-1 py-4 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-sm transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isOwnExam ? "💾 Cập nhật bài thi" : "📋 Tạo bản sao"}
              </button>
            </div>
            {!previewData && (
              <p className="text-xs text-center text-amber-600 italic">⚠️ Cần bấm "Biên dịch lại" trước khi lưu.</p>
            )}
          </div>

          {/* ── Preview ──────────────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-3xl shadow-inner border border-gray-200 p-8 min-h-[600px]">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Bản xem trước</h2>
            {!previewData ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-gray-400 gap-4">
                <div className="text-5xl">👀</div>
                <p className="text-sm">Bấm "Biên dịch lại" để xem trước nội dung đề thi.</p>
              </div>
            ) : (
              <div className="space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <div className="text-center border-b border-gray-100 pb-6 mb-6">
                  <h1 className="text-2xl font-extrabold text-gray-900">{previewData.title}</h1>
                  <p className="text-gray-400 text-sm mt-1">{previewData.questions.length} câu hỏi</p>
                </div>
                {previewData.questions.map((q, index) => (
                  <div key={q.id} className="mb-10 border-b border-gray-100 pb-8 last:border-0">
                    <div className="flex gap-3 mb-4">
                      <span className="font-bold text-blue-600 shrink-0">Câu {index + 1}:</span>
                      {!q.tikzCode && <div className="text-gray-900 leading-relaxed font-medium">{processLatexText(q.questionText)}</div>}
                    </div>
                    {q.tikzCode ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div className="space-y-4">
                          <div className="text-gray-900 leading-relaxed">{processLatexText(q.questionText)}</div>
                          <AnswerPreview q={q} />
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col items-center min-h-[180px]">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Hình vẽ</p>
                          <TikzRenderer code={q.tikzCode} />
                        </div>
                      </div>
                    ) : (
                      <AnswerPreview q={q} />
                    )}
                    {q.explanation && (
                      <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600">
                        <span className="font-bold">Lời giải: </span>{processLatexText(q.explanation)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}

function AnswerPreview({ q }: { q: ParsedQuestion }) {
  if (q.type === "multiple_choice" && q.options) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-8">
        {q.options.map((opt, i) => (
          <div key={i} className={`p-3 rounded-xl border text-sm ${q.correctAnswer === i ? "border-green-500 bg-green-50 text-green-900" : "border-gray-200 text-gray-700"}`}>
            <span className="font-bold mr-1">{String.fromCharCode(65 + i)}.</span>
            <Latex>{opt}</Latex>
          </div>
        ))}
      </div>
    );
  }
  if (q.type === "true_false" && q.options) {
    return (
      <div className="space-y-2 pl-8">
        {q.options.map((opt, i) => (
          <div key={i} className="p-3 rounded-xl border border-gray-200 text-sm text-gray-700 flex justify-between items-center gap-4">
            <div className="flex-1"><span className="font-bold mr-1">{String.fromCharCode(97 + i)})</span><Latex>{opt}</Latex></div>
            <span className={`font-bold px-2 py-0.5 rounded text-xs shrink-0 ${(q.correctAnswer as boolean[])[i] ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {(q.correctAnswer as boolean[])[i] ? "ĐÚNG" : "SAI"}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (q.type === "short_answer") {
    return (
      <div className="pl-8">
        <div className="inline-block p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-sm">
          <span className="font-bold mr-1">Đáp án:</span>
          <Latex>{String(q.correctAnswer ?? "")}</Latex>
        </div>
      </div>
    );
  }
  return null;
}
