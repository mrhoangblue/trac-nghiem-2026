"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import Latex from "react-latex-next";
import "katex/dist/katex.min.css";
import { parseLatexExam, ParsedQuestion } from "@/utils/latexParser";
import { processLatexText } from "@/utils/textProcessor";
import TikzRenderer from "@/components/TikzRenderer";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import { GRADE_LEVELS, EXAM_TYPES } from "@/components/Sidebar";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import type { ClassDoc } from "@/utils/classroomTypes";
import { toStoredDateTime, validateTimeRange } from "@/utils/examSchedule";

interface ScoringConfig {
  part1TotalScore: number;
  part3TotalScore: number;
}

interface ClassOption {
  id: string;
  name: string;
}

interface UploadQuizResponse {
  id?: string;
  convertedCount: number;
  failedCount?: number;
  tikzProcessed: boolean;
  error?: string;
}

interface FileImportResponse {
  title?: string;
  questions?: ParsedQuestion[];
  latex?: string;
  warnings?: string[];
  stats?: {
    questionCount: number;
    equationCount: number;
    imageCount: number;
    pageCount?: number;
  };
  sourceObject?: { key: string; url: string | null } | null;
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
  const [importingFile, setImportingFile] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<FileImportResponse["stats"] | null>(null);
  const [importSourceObject, setImportSourceObject] = useState<FileImportResponse["sourceObject"]>(null);

  const [scoringConfig, setScoringConfig] = useState<ScoringConfig>({
    part1TotalScore: 3,
    part3TotalScore: 1,
  });
  const [duration, setDuration] = useState(90);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [examPassword, setExamPassword] = useState("");

  // ── New fields ─────────────────────────────────────────────────────────────
  const [maxRetries, setMaxRetries] = useState(1);
  const [isShared, setIsShared] = useState(false);
  const [gradeLevel, setGradeLevel] = useState<string>(GRADE_LEVELS[0]);
  const [examType, setExamType] = useState<string>(EXAM_TYPES[0]);

  // ── Target audience ─────────────────────────────────────────────────────────
  const [targetType, setTargetType] = useState<"all" | "classes">("all");
  const [targetClassIds, setTargetClassIds] = useState<string[]>([]);
  const [myClasses, setMyClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);

  const [previewData, setPreviewData] = useState<{
    title: string;
    questions: ParsedQuestion[];
  } | null>(null);

  // Load teacher's classes when switching to "classes" mode
  useEffect(() => {
    if (targetType !== "classes" || !user?.uid || myClasses.length > 0) return;
    const teacherId = user.uid;
    async function loadClasses() {
      setClassesLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, "classes"), where("teacherId", "==", teacherId), where("isActive", "==", true))
        );
        setMyClasses(snap.docs.map((d) => ({ id: d.id, name: (d.data() as ClassDoc).name })));
      } finally {
        setClassesLoading(false);
      }
    }
    void loadClasses();
  }, [targetType, user?.uid, myClasses.length]);

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

  const handleExamFile = async (file: File | null) => {
    if (!file || !user) return;
    setImportingFile(true);
    setImportWarnings([]);
    setImportSummary(null);
    setImportSourceObject(null);
    try {
      const token = await user.getIdToken();
      const presignResponse = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size, folder: "exam-imports" }),
      });
      const presigned = (await presignResponse.json().catch(() => null)) as { uploadUrl?: string; key?: string; contentType?: string; error?: string } | null;
      let response: Response;
      if (presignResponse.ok && presigned?.uploadUrl && presigned.key) {
        const directUpload = await fetch(presigned.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": presigned.contentType || "application/octet-stream" },
          body: file,
        });
        if (!directUpload.ok) throw new Error("R2 từ chối file. Hãy kiểm tra CORS của bucket.");
        response = await fetch("/api/import-exam-file", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ key: presigned.key, fileName: file.name, contentType: file.type, size: file.size }),
        });
      } else if (presigned?.error === "R2_NOT_READY") {
        const formData = new FormData();
        formData.set("file", file);
        response = await fetch("/api/import-exam-file", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        throw new Error(presigned?.error === "FILE_SIZE_INVALID" ? "File phải nhỏ hơn 25 MB." : "Không thể chuẩn bị vùng upload R2.");
      }
      const payload = (await response.json().catch(() => null)) as FileImportResponse | null;
      if (!response.ok || !payload?.questions || typeof payload.latex !== "string") {
        const messages: Record<string, string> = {
          FILE_SIZE_INVALID: "File phải nhỏ hơn 25 MB.",
          FILE_TYPE_UNSUPPORTED: "Chỉ hỗ trợ file DOCX hoặc PDF.",
          DOCX_INVALID: "File DOCX không hợp lệ hoặc đã bị hỏng.",
        };
        throw new Error(messages[payload?.error ?? ""] ?? "Không thể đọc file đề thi.");
      }

      const classified = smartParseLatex(payload.latex);
      const importedTitle = examTitle.trim() || payload.title || file.name.replace(/\.(docx|pdf)$/i, "");
      setExamTitle(importedTitle);
      setSmartMode(true);
      setSmartInput(payload.latex);
      setPart1(classified.part1);
      setPart2(classified.part2);
      setPart3(classified.part3);
      setSmartResult({ counts: classified.counts });
      setPreviewData({ title: importedTitle, questions: payload.questions });
      setImportWarnings(payload.warnings ?? []);
      setImportSummary(payload.stats ?? null);
      setImportSourceObject(payload.sourceObject ?? null);
    } catch (error) {
      setImportWarnings([error instanceof Error ? error.message : "Không thể nhập file đề thi."]);
    } finally {
      setImportingFile(false);
    }
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
    const timeError = validateTimeRange(startTime, endTime);
    if (timeError) {
      alert(timeError);
      return;
    }
    if (examPassword && examPassword.normalize("NFKC").length < 4) {
      alert("Mật khẩu đề thi phải có ít nhất 4 ký tự.");
      return;
    }
    setSaving(true);
    try {
      const token = await user?.getIdToken();
      const uploadResponse = await fetch("/api/upload-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          title: previewData.title,
          description: "",
          questions: previewData.questions,
          scoringConfig: {
            part1TotalScore: Number(scoringConfig.part1TotalScore),
            part3TotalScore: Number(scoringConfig.part3TotalScore),
          },
          duration: Number(duration),
          startTime: toStoredDateTime(startTime),
          endTime: toStoredDateTime(endTime),
          password: examPassword,
          rawLatex: { part1, part2, part3 },
          authorEmail: user?.email ?? "",
          maxRetries: Number(maxRetries),
          isShared,
          gradeLevel,
          examType: gradeLevel === "Thi Thử TN THPT" ? null : examType,
          targetType,
          targetClassIds: targetType === "classes" ? targetClassIds : [],
          importSourceObject,
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

      alert("✓ Đã lưu bài thi lên Firestore thành công!");
      setExamTitle(""); setPart1(""); setPart2(""); setPart3("");
      setSmartInput(""); setSmartResult(null); setPreviewData(null);
      setScoringConfig({ part1TotalScore: 3, part3TotalScore: 1 });
      setDuration(90); setStartTime(""); setEndTime(""); setExamPassword("");
      setMaxRetries(1); setIsShared(false);
      setGradeLevel(GRADE_LEVELS[0]); setExamType(EXAM_TYPES[0]);
      setTargetType("all"); setTargetClassIds([]);
      setImportWarnings([]); setImportSummary(null); setImportSourceObject(null);
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
                className="w-full p-4 border-2 border-gray-200 rounded-xl font-medium focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all"
                placeholder="VD: Kiểm tra Giữa kì 1 - Toán 12"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
              />
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xl text-white">⇧</span>
                <div>
                  <h3 className="font-extrabold text-blue-950">Nhập đề từ Word hoặc PDF</h3>
                  <p className="mt-1 text-xs leading-5 text-blue-800/75">Hỗ trợ DOCX có Word Equation, ảnh PNG/JPG/SVG và PDF có lớp văn bản. Hãy xem trước và chỉnh lại đáp án trước khi lưu.</p>
                </div>
              </div>
              <label className={`mt-4 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed px-4 py-3 text-sm font-bold transition ${importingFile ? "cursor-wait border-blue-200 bg-white/50 text-blue-400" : "border-blue-300 bg-white text-blue-700 hover:border-blue-500 hover:bg-blue-50"}`}>
                {importingFile ? "Đang đọc và phân tích file…" : "Chọn file .docx hoặc .pdf"}
                <input
                  type="file"
                  accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={importingFile}
                  className="sr-only"
                  onChange={(event) => {
                    void handleExamFile(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              {importSummary && (
                <p className="mt-3 text-xs font-semibold text-blue-800">Đã nhận diện {importSummary.questionCount} câu · {importSummary.equationCount} công thức · {importSummary.imageCount} hình{importSummary.pageCount ? ` · ${importSummary.pageCount} trang` : ""}.</p>
              )}
              {importWarnings.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  <p className="font-bold">Cần kiểm tra lại:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">{importWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
                </div>
              )}
            </div>

            {/* ── Phân loại đề (cây thư mục) ──────────────────────────── */}
            <div className="bg-gradient-to-br from-brand-50 to-brand-50 border border-brand-100 rounded-2xl p-5 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-brand-500">🗂️</span> Phân loại đề thi
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
                          ? "border-brand-500 bg-brand-50 text-brand-700"
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
                            ? "border-brand-400 bg-brand-50 text-brand-700"
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
            <div className="bg-gradient-to-br from-danger-50 to-orange-50 border border-danger-100 rounded-2xl p-5 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-danger-500">⚙️</span> Cấu hình làm bài
              </h3>

              {/* maxRetries */}
              <div className="bg-white rounded-xl border border-danger-100 p-4">
                <label className="text-sm font-bold text-gray-700 block mb-2">
                  Số lần làm lại (maxRetries)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    className="w-24 p-2 border-2 border-danger-200 rounded-lg text-center font-bold text-danger-700 focus:border-danger-500 outline-none"
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value) || 0)}
                  />
                  <span className="text-sm text-gray-500">lần</span>
                </div>
                <p className="text-xs text-gray-400 italic mt-1.5">
                  💡 Nhập <strong>0</strong> = không giới hạn số lần làm bài.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-danger-100 p-4">
                <label className="text-sm font-bold text-gray-700 block mb-2">
                  Mật khẩu mở đề <span className="font-normal text-gray-400">(không bắt buộc)</span>
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={4}
                  maxLength={128}
                  value={examPassword}
                  onChange={(event) => setExamPassword(event.target.value)}
                  placeholder="Tối thiểu 4 ký tự"
                  className="w-full p-2.5 border-2 border-danger-200 rounded-lg text-sm focus:border-danger-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Mật khẩu được mã hóa một chiều và không lưu chung với nội dung đề.
                </p>
              </div>

              {/* isShared */}
              <div className="bg-white rounded-xl border border-danger-100 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setIsShared(!isShared)}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                      isShared ? "bg-brand-500" : "bg-gray-300"
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

            {/* ── Đối tượng làm bài ────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-success-50 to-brand-50 border border-success-100 rounded-2xl p-5 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-success-500">🎯</span> Đối tượng làm bài
              </h3>

              <div className="flex gap-3">
                {([
                  { value: "all", label: "Tất cả học sinh", desc: "Ai có link đề đều làm được" },
                  { value: "classes", label: "Lớp cụ thể", desc: "Chỉ HS trong lớp được chọn" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTargetType(opt.value)}
                    className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${
                      targetType === opt.value
                        ? "border-success-500 bg-success-50 text-success-800"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-bold text-sm">{opt.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {targetType === "classes" && (
                <div className="bg-white rounded-xl border border-success-100 p-4">
                  {classesLoading ? (
                    <div className="flex justify-center py-3">
                      <div className="w-5 h-5 border-2 border-success-200 border-t-success-500 rounded-full animate-spin" />
                    </div>
                  ) : myClasses.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-2">
                      Bạn chưa có lớp nào. Tạo lớp tại{" "}
                      <Link href="/teacher/classes" className="text-success-600 underline">Quản lý lớp học</Link>.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                        Chọn lớp được phép làm bài
                      </p>
                      <div className="space-y-2">
                        {myClasses.map((cls) => (
                          <label key={cls.id} className="flex items-center gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={targetClassIds.includes(cls.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTargetClassIds((prev) => [...prev, cls.id]);
                                } else {
                                  setTargetClassIds((prev) => prev.filter((id) => id !== cls.id));
                                }
                              }}
                              className="w-4 h-4 accent-success-600"
                            />
                            <span className="text-sm font-medium text-gray-700 group-hover:text-success-700 transition-colors">
                              {cls.name}
                            </span>
                          </label>
                        ))}
                      </div>
                      {targetClassIds.length === 0 && (
                        <p className="text-xs text-amber-600 mt-3 font-medium">
                          ⚠️ Chưa chọn lớp nào — vui lòng chọn ít nhất một lớp.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Mode toggle ──────────────────────────────────────────── */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setSmartMode(false)}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  !smartMode ? "bg-white shadow text-brand-700" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                ✂️ Nhập từng phần
              </button>
              <button
                onClick={() => setSmartMode(true)}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  smartMode ? "bg-white shadow text-brand-700" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                ✨ Smart Input (1 lần dán)
              </button>
            </div>

            {/* ── Smart Input mode ─────────────────────────────────────── */}
            {smartMode && (
              <div className="space-y-4">
                <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 flex gap-3">
                  <span className="text-brand-500 text-xl shrink-0">💡</span>
                  <div className="text-sm text-brand-800">
                    <p className="font-bold mb-1">Chế độ nhập thông minh</p>
                    <p className="leading-relaxed text-brand-700">
                      Dán toàn bộ nội dung file LaTeX. Hệ thống tự phân loại dựa trên{" "}
                      <code className="bg-brand-100 px-1 rounded text-xs font-mono">\choice</code>{" "}
                      /{" "}
                      <code className="bg-brand-100 px-1 rounded text-xs font-mono">\choiceTF</code>{" "}
                      /{" "}
                      <code className="bg-brand-100 px-1 rounded text-xs font-mono">\shortans</code>.
                    </p>
                  </div>
                </div>

                <textarea
                  className="w-full h-56 p-4 border-2 border-brand-200 rounded-xl font-mono text-xs focus:border-brand-500 outline-none transition-all resize-y bg-gray-50"
                  placeholder={"% Dán toàn bộ nội dung file .tex vào đây\n\\begin{ex}\n  ...\n  \\choice{A}{B}{C}{\\True D}\n\\end{ex}"}
                  value={smartInput}
                  onChange={(e) => setSmartInput(e.target.value)}
                  spellCheck={false}
                />

                <button
                  onClick={handleSmartClassify}
                  className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all"
                >
                  ✨ Phân loại tự động
                </button>

                {smartResult && (
                  <div className="bg-success-50 border border-success-200 rounded-2xl p-4">
                    <p className="font-bold text-success-800 text-sm mb-2">Kết quả phân loại:</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      {[
                        { label: "Phần I", count: smartResult.counts.p1, cls: "bg-brand-100 text-brand-700" },
                        { label: "Phần II", count: smartResult.counts.p2, cls: "bg-amber-100 text-amber-700" },
                        { label: "Phần III", count: smartResult.counts.p3, cls: "bg-success-100 text-success-700" },
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
                    <p className="mt-2 text-xs text-success-700">
                      ✓ Kết quả đã điền vào 3 ô bên dưới.
                    </p>
                  </div>
                )}

                <hr className="border-gray-200" />
              </div>
            )}

            {/* ── LaTeX inputs ─────────────────────────────────────────── */}
            <div className="space-y-6">
              {[
                { label: "Phần I: Trắc nghiệm nhiều phương án (\\choice)", value: part1, set: setPart1, accent: "border-brand-200 focus:border-brand-400" },
                { label: "Phần II: Trắc nghiệm Đúng/Sai (\\choiceTF)",   value: part2, set: setPart2, accent: "border-amber-200 focus:border-amber-400" },
                { label: "Phần III: Trả lời ngắn (\\shortans / \\dapso)", value: part3, set: setPart3, accent: "border-success-200 focus:border-success-400" },
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
            <div className="bg-gradient-to-br from-brand-50 to-brand-50 border border-brand-100 rounded-2xl p-6 space-y-5">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-brand-500">🎯</span> Thiết lập điểm số
              </h3>

              <div className="bg-white rounded-xl border border-brand-100 p-4 space-y-2">
                <p className="text-sm font-bold text-gray-700">Phần I — Trắc nghiệm 1 đáp án</p>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Tổng điểm:</label>
                  <input
                    type="number" min={0} step={0.5}
                    className="w-24 p-2 border-2 border-brand-200 rounded-lg text-center font-bold text-brand-700 focus:border-brand-500 outline-none"
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

              <div className="bg-white rounded-xl border border-brand-100 p-4 space-y-2">
                <p className="text-sm font-bold text-gray-700">Phần III — Trả lời ngắn</p>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Tổng điểm:</label>
                  <input
                    type="number" min={0} step={0.5}
                    className="w-24 p-2 border-2 border-brand-200 rounded-lg text-center font-bold text-brand-700 focus:border-brand-500 outline-none"
                    value={scoringConfig.part3TotalScore}
                    onChange={(e) => setScoringConfig((s) => ({ ...s, part3TotalScore: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="text-sm text-gray-500">điểm</span>
                </div>
              </div>
            </div>

            {/* ── Thời gian ────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-brand-50 to-brand-50 border border-brand-100 rounded-2xl p-6 space-y-4">
              <h3 className="font-extrabold text-gray-800 flex items-center gap-2">
                <span className="text-brand-500">⏱</span> Cấu hình thời gian
              </h3>
              <div className="bg-white rounded-xl border border-brand-100 p-4">
                <p className="text-sm font-bold text-gray-700 mb-2">Thời gian làm bài</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={1} max={300}
                    className="w-24 p-2 border-2 border-brand-200 rounded-lg text-center font-bold text-brand-700 focus:border-brand-500 outline-none"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 90)}
                  />
                  <span className="text-sm text-gray-500">phút</span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-brand-100 p-4 space-y-3">
                <p className="text-sm font-bold text-gray-700">Khung thời gian làm bài</p>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">
                    Mở đề từ <span className="text-gray-400 font-normal">(bỏ trống = mở ngay)</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full p-2.5 border-2 border-brand-200 rounded-lg text-sm focus:border-brand-500 outline-none transition-all"
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
                    className="w-full p-2.5 border-2 border-brand-200 rounded-lg text-sm focus:border-brand-500 outline-none transition-all"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handlePreview}
              className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-sm transition-all hover:shadow hover:-translate-y-0.5"
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
                  className="px-6 py-2 bg-success-500 hover:bg-success-600 disabled:opacity-60 text-white font-bold rounded-lg shadow-sm transition-all flex items-center gap-2"
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
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-semibold">{gradeLevel}</span>
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
                    multiple_choice: { roman: "I",   label: "Trắc nghiệm nhiều phương án", cls: "bg-brand-50 border-brand-200 text-brand-800" },
                    true_false:      { roman: "II",  label: "Trắc nghiệm Đúng – Sai",      cls: "bg-amber-50 border-amber-200 text-amber-800" },
                    short_answer:    { roman: "III", label: "Trả lời ngắn",                  cls: "bg-success-50 border-success-200 text-success-800" },
                  }[type];
                  return (
                    <div key={type}>
                      <div className={`mb-5 px-5 py-3 rounded-2xl border-2 ${meta.cls}`}>
                        <p className="font-extrabold text-sm">PHẦN {meta.roman}: {meta.label}</p>
                      </div>
                      {sectionQs.map((q) => (
                        <div key={q.id} className="mb-10 border-b border-gray-100 pb-8 last:border-0">
                          <div className="flex gap-3 mb-4">
                            <span className="font-bold text-brand-600 shrink-0">Câu {previewData.questions.indexOf(q) + 1}:</span>
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
                          {q.imageUrls && q.imageUrls.length > 0 && (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              {q.imageUrls.map((url, imageIndex) => (
                                <Image key={`${url}-${imageIndex}`} src={url} alt={`Hình minh họa ${imageIndex + 1}`} width={960} height={640} unoptimized className="max-h-72 w-full rounded-xl border border-gray-200 bg-gray-50 object-contain p-2" />
                              ))}
                            </div>
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
          <div key={i} className={`p-3 rounded-xl border text-sm ${q.correctAnswer === i ? "border-success-500 bg-success-50 text-success-900" : "border-gray-200 text-gray-700"}`}>
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
            <div className={`font-bold px-3 py-1 rounded-md text-sm shrink-0 ${(q.correctAnswer as boolean[])[i] ? "bg-success-100 text-success-700" : "bg-danger-100 text-danger-700"}`}>
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
        <div className="inline-block p-3 rounded-xl border border-brand-200 bg-brand-50 text-brand-900">
          <span className="font-bold mr-2">Đáp án:</span>
          <Latex>{String(q.correctAnswer ?? "")}</Latex>
        </div>
      </div>
    );
  }
  return null;
}
