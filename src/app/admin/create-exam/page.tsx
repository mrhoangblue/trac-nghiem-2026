"use client";

import { useState } from "react";
import Latex from "react-latex-next";
import "katex/dist/katex.min.css";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import TikzRenderer from "@/components/TikzRenderer";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import { GRADE_LEVELS, EXAM_TYPES } from "@/components/Sidebar";

interface ScoringConfig {
  part1TotalScore: number;
  part3TotalScore: number;
}

interface UploadQuizResponse {
  id?: string;
  convertedCount: number;
  failedCount?: number;
  tikzProcessed: boolean;
  error?: string;
}

// ── Smart Parser ──────────────────────────────────────────────────────────────

function smartParseLatex(allLatex: string): {
  part1: string;
  part2: string;
  part3: string;
  counts: { p1: number; p2: number; p3: number; unknown: number };
} {
  const src = allLatex.replace(/(?<!\\)%[^\n]*/g, "");
  const blockRe = /\\begin\{(ex|bt)\}([\s\S]*?)\\end\{\1\}/g;
  let match: RegExpExecArray | null;
  const p1: string[] = [];
  const p2: string[] = [];
  const p3: string[] = [];
  let unknown = 0;

  while ((match = blockRe.exec(src)) !== null) {
    const content = match[2];
    const fullBlock = match[0];
    if (/\\choiceTF\b/.test(content)) {
      p2.push(fullBlock);
    } else if (/\\choice\b/.test(content)) {
      p1.push(fullBlock);
    } else if (/\\shortans\b|\\dapso\b/.test(content)) {
      p3.push(fullBlock);
    } else {
      p1.push(fullBlock);
      unknown++;
    }
  }

  return {
    part1: p1.join("\n\n"),
    part2: p2.join("\n\n"),
    part3: p3.join("\n\n"),
    counts: { p1: p1.length, p2: p2.length, p3: p3.length, unknown },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreateExamPage() {
  const { user } = useAuth();

  const [examTitle, setExamTitle] = useState("");
  const [part1, setPart1] = useState("");
  const [part2, setPart2] = useState("");
  const [part3, setPart3] = useState("");
  const [saving, setSaving] = useState(false);

  // Smart input
  const [smartMode, setSmartMode] = useState(false);
  const [smartInput, setSmartInput] = useState("");
  const [smartResult, setSmartResult] = useState<{
    counts: { p1: number; p2: number; p3: number; unknown: number };
  } | null>(null);

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

  const [previewData, setPreviewData] = useState<{
    title: string;
    questions: ParsedQuestion[];
  } | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSmartClassify = () => {
    if (!smartInput.trim()) {
      alert("Vui lòng nhập nội dung LaTeX vào ô bên dưới.");
      return;
    }
    const result = smartParseLatex(smartInput);
    setPart1(result.part1);
    setPart2(result.part2);
    setPart3(result.part3);
    setSmartResult({ counts: result.counts });
  };

  const handlePreview = () => {
    if (!examTitle.trim()) { alert("Vui lòng nhập tên bài thi!"); return; }
    try {
      const allQuestions = [
        ...parseLatexExam(part1),
        ...parseLatexExam(part2),
        ...parseLatexExam(part3),
      ].map((q, index) => ({ ...q, id: index + 1 }));
      setPreviewData({ title: examTitle, questions: allQuestions });
    } catch (error) {
      console.error(error);
      alert("Có lỗi xảy ra khi biên dịch LaTeX. Vui lòng kiểm tra lại cú pháp.");
    }
  };

  const handleSave = async () => {
    if (!previewData) return;
    setSaving(true);
    try {
      const uploadResponse = await fetch("/api/upload-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: previewData.title,
          description: "",
          questions: previewData.questions,
          scoringConfig: {
            part1TotalScore: Number(scoringConfig.part1TotalScore),
            part3TotalScore: Number(scoringConfig.part3TotalScore),
          },
          duration: Number(duration),
          startTime: startTime || null,
          endTime: endTime || null,
          rawLatex: { part1, part2, part3 },
          authorEmail: user?.email ?? "",
          maxRetries: Number(maxRetries),
          isShared,
          gradeLevel,
          examType: gradeLevel === "Thi Thử TN THPT" ? null : examType,
        }),
      });

      const uploaded = (await uploadResponse.json()) as UploadQuizResponse;
      if (!uploadResponse.ok) {
        throw new Error(uploaded.error ?? "Không thể lưu bài thi.");
      }
      if ((uploaded.failedCount ?? 0) > 0) {
        alert(
          `Đã lưu bài thi, nhưng có ${uploaded.failedCount} hình TikZ không chuyển được. ` +
          "Các hình lỗi được giữ nguyên bằng cơ chế TikZ cũ."
        );
      }

      alert("✅ Đã lưu bài thi lên Firestore thành công!");
      setExamTitle(""); setPart1(""); setPart2(""); setPart3("");
      setSmartInput(""); setSmartResult(null); setPreviewData(null);
      setScoringConfig({ part1TotalScore: 3, part3TotalScore: 1 });
      setDuration(90); setStartTime(""); setEndTime("");
      setMaxRetries(1); setIsShared(false);
      setGradeLevel(GRADE_LEVELS[0]); setExamType(EXAM_TYPES[0]);
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi khi lưu bài thi. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminGuard>
      <div className="max-w-6xl mx-auto px-4 py-12 w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">Tạo Bài Thi Mới</h1>
            <p className="text-gray-500 mt-2">Nhập mã LaTeX chuẩn ex_test 3.1 để tạo bài thi.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* ── Editor Form ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6">
            {/* Tên bài thi */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Tên bài thi</label>
              <input
                type="text"
                className="w-full p-4 border-2 border-gray-200 rounded-xl font-medium focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                placeholder="VD: Kiểm tra Giữa kì 1 - Toán 12"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
              />
            </div>

            {/* ── Phân loại đề (cây thư mục) ──────────────────────────── */}
            <div className="bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-100 rounded-2xl p-5 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-sky-500">🗂️</span> Phân loại đề thi
              </h3>

              {/* Cấp 1: grade */}
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

              {/* Cấp 2: exam type (ẩn nếu Thi Thử TN THPT) */}
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

            {/* ── Cấu hình làm bài ──────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-100 rounded-2xl p-5 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-rose-500">⚙️</span> Cấu hình làm bài
              </h3>

              {/* maxRetries */}
              <div className="bg-white rounded-xl border border-rose-100 p-4">
                <label className="text-sm font-bold text-gray-700 block mb-2">
                  Số lần làm lại (maxRetries)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    className="w-24 p-2 border-2 border-rose-200 rounded-lg text-center font-bold text-rose-700 focus:border-rose-500 outline-none"
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value) || 0)}
                  />
                  <span className="text-sm text-gray-500">lần</span>
                </div>
                <p className="text-xs text-gray-400 italic mt-1.5">
                  💡 Nhập <strong>0</strong> = không giới hạn số lần làm bài.
                </p>
              </div>

              {/* isShared */}
              <div className="bg-white rounded-xl border border-rose-100 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setIsShared(!isShared)}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                      isShared ? "bg-blue-500" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        isShared ? "translate-x-5" : ""
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-700">Chia sẻ đề thi</p>
                    <p className="text-xs text-gray-400">
                      {isShared
                        ? "Giáo viên khác có thể xem và nhân bản đề này."
                        : "Chỉ bạn mới thấy đề này trong kho của mình."}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* ── Mode toggle ──────────────────────────────────────────── */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setSmartMode(false)}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  !smartMode ? "bg-white shadow text-blue-700" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                ✂️ Nhập từng phần
              </button>
              <button
                onClick={() => setSmartMode(true)}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  smartMode ? "bg-white shadow text-blue-700" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                ✨ Smart Input (1 lần dán)
              </button>
            </div>

            {/* ── Smart Input mode ─────────────────────────────────────── */}
            {smartMode && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
                  <span className="text-blue-500 text-xl shrink-0">💡</span>
                  <div className="text-sm text-blue-800">
                    <p className="font-bold mb-1">Chế độ nhập thông minh</p>
                    <p className="leading-relaxed text-blue-700">
                      Dán toàn bộ nội dung file LaTeX. Hệ thống tự phân loại dựa trên{" "}
                      <code className="bg-blue-100 px-1 rounded text-xs font-mono">\choice</code>{" "}
                      /{" "}
                      <code className="bg-blue-100 px-1 rounded text-xs font-mono">\choiceTF</code>{" "}
                      /{" "}
                      <code className="bg-blue-100 px-1 rounded text-xs font-mono">\shortans</code>.
                    </p>
                  </div>
                </div>

                <textarea
                  className="w-full h-56 p-4 border-2 border-blue-200 rounded-xl font-mono text-xs focus:border-blue-500 outline-none transition-all resize-y bg-gray-50"
                  placeholder={"% Dán toàn bộ nội dung file .tex vào đây\n\\begin{ex}\n  ...\n  \\choice{A}{B}{C}{\\True D}\n\\end{ex}"}
                  value={smartInput}
                  onChange={(e) => setSmartInput(e.target.value)}
                  spellCheck={false}
                />

                <button
                  onClick={handleSmartClassify}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all"
                >
                  ✨ Phân loại tự động
                </button>

                {smartResult && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                    <p className="font-bold text-emerald-800 text-sm mb-2">Kết quả phân loại:</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      {[
                        { label: "Phần I", count: smartResult.counts.p1, cls: "bg-purple-100 text-purple-700" },
                        { label: "Phần II", count: smartResult.counts.p2, cls: "bg-amber-100 text-amber-700" },
                        { label: "Phần III", count: smartResult.counts.p3, cls: "bg-emerald-100 text-emerald-700" },
                      ].map(({ label, count, cls }) => (
                        <div key={label} className={`rounded-xl px-3 py-2 ${cls}`}>
                          <p className="font-extrabold text-xl">{count}</p>
                          <p className="text-xs font-semibold opacity-80">{label}</p>
                        </div>
                      ))}
                    </div>
                    {smartResult.counts.unknown > 0 && (
                      <p className="mt-2 text-xs text-amber-700 font-medium">
                        ⚠️ {smartResult.counts.unknown} câu không nhận dạng → đưa vào Phần I.
                      </p>
                    )}
                    <p className="mt-2 text-xs text-emerald-700">
                      ✅ Kết quả đã điền vào 3 ô bên dưới.
                    </p>
                  </div>
                )}

                <hr className="border-gray-200" />
              </div>
            )}

            {/* ── LaTeX inputs ─────────────────────────────────────────── */}
            <div className="space-y-6">
              {[
                { label: "Phần I: Trắc nghiệm nhiều phương án (\\choice)", value: part1, set: setPart1, accent: "border-purple-200 focus:border-purple-400" },
                { label: "Phần II: Trắc nghiệm Đúng/Sai (\\choiceTF)",   value: part2, set: setPart2, accent: "border-amber-200 focus:border-amber-400" },
                { label: "Phần III: Trả lời ngắn (\\shortans / \\dapso)", value: part3, set: setPart3, accent: "border-emerald-200 focus:border-emerald-400" },
              ].map(({ label, value, set, accent }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700">{label}</label>
                    {value && (
                      <span className="text-xs text-gray-400 font-mono">
                        {value.split(/\\begin\{(?:ex|bt)\}/).length - 1} câu
                      </span>
                    )}
                  </div>
                  <textarea
                    className={`w-full h-36 p-4 border-2 ${accent} rounded-xl font-mono text-sm outline-none transition-all resize-y`}
                    placeholder="\begin{ex}...\end{ex}"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>

            {/* ── Điểm số ──────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 space-y-5">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-blue-500">🎯</span> Thiết lập điểm số
              </h3>

              <div className="bg-white rounded-xl border border-blue-100 p-4 space-y-2">
                <p className="text-sm font-bold text-gray-700">Phần I — Trắc nghiệm 1 đáp án</p>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Tổng điểm:</label>
                  <input
                    type="number" min={0} step={0.5}
                    className="w-24 p-2 border-2 border-blue-200 rounded-lg text-center font-bold text-blue-700 focus:border-blue-500 outline-none"
                    value={scoringConfig.part1TotalScore}
                    onChange={(e) => setScoringConfig((s) => ({ ...s, part1TotalScore: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="text-sm text-gray-500">điểm</span>
                </div>
                <p className="text-xs text-gray-400 italic">💡 Hệ thống tự chia đều cho số câu.</p>
              </div>

              <div className="bg-white rounded-xl border border-amber-100 p-4 space-y-2">
                <p className="text-sm font-bold text-gray-700">Phần II — Đúng/Sai (luật cố định)</p>
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
                <p className="text-sm font-bold text-gray-700">Phần III — Trả lời ngắn</p>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Tổng điểm:</label>
                  <input
                    type="number" min={0} step={0.5}
                    className="w-24 p-2 border-2 border-blue-200 rounded-lg text-center font-bold text-blue-700 focus:border-blue-500 outline-none"
                    value={scoringConfig.part3TotalScore}
                    onChange={(e) => setScoringConfig((s) => ({ ...s, part3TotalScore: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="text-sm text-gray-500">điểm</span>
                </div>
              </div>
            </div>

            {/* ── Thời gian ────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-6 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-violet-500">⏱</span> Cấu hình thời gian
              </h3>
              <div className="bg-white rounded-xl border border-violet-100 p-4">
                <p className="text-sm font-bold text-gray-700 mb-2">Thời gian làm bài</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={1} max={300}
                    className="w-24 p-2 border-2 border-violet-200 rounded-lg text-center font-bold text-violet-700 focus:border-violet-500 outline-none"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 90)}
                  />
                  <span className="text-sm text-gray-500">phút</span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-violet-100 p-4 space-y-3">
                <p className="text-sm font-bold text-gray-700">Khung thời gian làm bài</p>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">
                    Mở đề từ <span className="text-gray-400 font-normal">(bỏ trống = mở ngay)</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full p-2.5 border-2 border-violet-200 rounded-lg text-sm focus:border-violet-500 outline-none transition-all"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">
                    Đóng đề lúc <span className="text-gray-400 font-normal">(bỏ trống = không giới hạn)</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full p-2.5 border-2 border-violet-200 rounded-lg text-sm focus:border-violet-500 outline-none transition-all"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handlePreview}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-all hover:shadow hover:-translate-y-0.5"
            >
              Biên dịch &amp; Xem trước
            </button>
          </div>

          {/* ── Live Preview ─────────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-3xl shadow-inner border border-gray-200 p-8 min-h-[800px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Bản xem trước</h2>
              {previewData && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-bold rounded-lg shadow-sm transition-all flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang lưu…
                    </>
                  ) : (
                    "💾 Lưu bài thi"
                  )}
                </button>
              )}
            </div>

            {!previewData ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 min-h-[400px]">
                <div className="text-6xl mb-4">👀</div>
                <p>Chưa có dữ liệu. Hãy bấm Biên dịch để xem trước!</p>
              </div>
            ) : (
              <div className="space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <div className="text-center mb-8 border-b border-gray-100 pb-6">
                  <h1 className="text-2xl font-extrabold text-gray-900 mb-2">{previewData.title}</h1>
                  <div className="flex items-center justify-center gap-2 flex-wrap mt-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{gradeLevel}</span>
                    {gradeLevel !== "Thi Thử TN THPT" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{examType}</span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mt-2">Tổng số câu hỏi: {previewData.questions.length}</p>
                </div>

                {(["multiple_choice", "true_false", "short_answer"] as const).map((type) => {
                  const sectionQs = previewData.questions.filter((q) => q.type === type);
                  if (sectionQs.length === 0) return null;
                  const meta = {
                    multiple_choice: { roman: "I",   label: "Trắc nghiệm nhiều phương án", cls: "bg-purple-50 border-purple-200 text-purple-800" },
                    true_false:      { roman: "II",  label: "Trắc nghiệm Đúng – Sai",      cls: "bg-amber-50 border-amber-200 text-amber-800" },
                    short_answer:    { roman: "III", label: "Trả lời ngắn",                  cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
                  }[type];
                  return (
                    <div key={type}>
                      <div className={`mb-5 px-5 py-3 rounded-2xl border-2 ${meta.cls}`}>
                        <p className="font-extrabold text-sm">PHẦN {meta.roman}: {meta.label}</p>
                      </div>
                      {sectionQs.map((q) => (
                        <div key={q.id} className="mb-10 border-b border-gray-100 pb-8 last:border-0">
                          <div className="flex gap-3 mb-4">
                            <span className="font-bold text-blue-600 shrink-0">Câu {previewData.questions.indexOf(q) + 1}:</span>
                            {!q.tikzCode && (
                              <div className="text-gray-900 leading-relaxed font-medium">{processLatexText(q.questionText)}</div>
                            )}
                          </div>
                          {q.tikzCode ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                              <div className="space-y-4">
                                <div className="text-gray-900 leading-relaxed font-medium">{processLatexText(q.questionText)}</div>
                                <AnswerPreview q={q} />
                              </div>
                              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[200px]">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Hình vẽ</p>
                                <TikzRenderer code={q.tikzCode} />
                              </div>
                            </div>
                          ) : (
                            <AnswerPreview q={q} />
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
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
            <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
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
          <div key={i} className="p-3 rounded-xl border border-gray-200 text-gray-700 flex justify-between items-center gap-4">
            <div className="flex-1"><span className="font-bold mr-2">{String.fromCharCode(97 + i)})</span><Latex>{opt}</Latex></div>
            <div className={`font-bold px-3 py-1 rounded-md text-sm shrink-0 ${(q.correctAnswer as boolean[])[i] ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {(q.correctAnswer as boolean[])[i] ? "ĐÚNG" : "SAI"}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (q.type === "short_answer") {
    return (
      <div className="pl-8">
        <div className="inline-block p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900">
          <span className="font-bold mr-2">Đáp án:</span>
          <Latex>{String(q.correctAnswer ?? "")}</Latex>
        </div>
      </div>
    );
  }
  return null;
}
