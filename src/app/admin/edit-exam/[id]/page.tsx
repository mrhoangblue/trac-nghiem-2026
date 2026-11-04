"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import AdminGuard from "@/components/AdminGuard";
import { getMissingShortAnswerQuestionNumbers, parseLatexExam, ParsedQuestion } from "@/utils/latexParser";
import { joinLatexParts, smartParseLatex, type SmartParseCounts } from "@/utils/smartParseLatex";
import { countQuestionsByPart, essayPointProblems, explicitEssayTotal, normalizeStructure, orderQuestionsByPart, withEssayPoints, structureParts, structureProblems, type ExamStructure } from "@/utils/examStructure";
import { useAuth } from "@/lib/AuthContext";
import { GRADE_LEVELS, EXAM_TYPES } from "@/components/Sidebar";
import type { ClassDoc } from "@/utils/classroomTypes";
import { toDateTimeLocal, toStoredDateTime, validateTimeRange } from "@/utils/examSchedule";
import { AlertTriangle, ArrowLeft, Copy, Eye, FileCode2, Loader2, PenLine, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import StateIcon from "@/components/StateIcon";
import { EditorCard, Field, Toggle, inputClass } from "@/components/exam-editor/EditorKit";
import ExamSourceInput, { type ImportStats } from "@/components/exam-editor/ExamSourceInput";
import ExamPreview from "@/components/exam-editor/ExamPreview";
import { importExamFile } from "@/components/exam-editor/importExamFile";
import { ExamInfoFields, ExamRulesFields, ExamStructurePicker, MOCK_EXAM_GRADE, type ClassOption, type ScoringConfig } from "@/components/exam-editor/ExamSettingsFields";
import { assignsClasses, normalizeTargetType, type ExamTargetType } from "@/utils/examAudience";
import { DEFAULT_VERSIONING, normalizeVersioning, type ExamVersioning } from "@/utils/examVersions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewData {
  title: string;
  questions: ParsedQuestion[];
}

interface ProcessTikzResponse {
  questions: ParsedQuestion[];
  convertedCount: number;
  failedCount?: number;
  failures?: Array<{ questionNumber: number; field: "question" | "explanation"; error: string }>;
  tikzProcessed: boolean;
  error?: string;
}

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
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
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // LaTeX parts
  const [examTitle, setExamTitle] = useState("");
  const [description, setDescription] = useState("");
  const [part1, setPart1] = useState("");
  const [part2, setPart2] = useState("");
  const [part3, setPart3] = useState("");
  const [part4, setPart4] = useState("");
  const [structure, setStructure] = useState<ExamStructure>("p123");
  const [smartInput, setSmartInput] = useState("");
  const [smartCounts, setSmartCounts] = useState<SmartParseCounts | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<ImportStats | null>(null);

  // Scoring / timing
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig>({
    part1TotalScore: 3,
    part3TotalScore: 3,
  });
  const [duration, setDuration] = useState(90);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);

  // ── New fields ─────────────────────────────────────────────────────────────
  const [maxRetries, setMaxRetries] = useState(1);
  const [versioning, setVersioning] = useState<ExamVersioning>(DEFAULT_VERSIONING);
  const [isShared, setIsShared] = useState(false);
  const [gradeLevel, setGradeLevel] = useState<string>(GRADE_LEVELS[0]);
  const [examType, setExamType] = useState<string>(EXAM_TYPES[0]);
  const [originalAuthorEmail, setOriginalAuthorEmail] = useState<string>("");

  // ── Target audience ─────────────────────────────────────────────────────────
  const [targetType, setTargetType] = useState<ExamTargetType>("all");
  const [targetClassIds, setTargetClassIds] = useState<string[]>([]);
  const [myClasses, setMyClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  // ── Load from Firestore ───────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !user) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "exams", id));
        if (!snap.exists()) { setLoadError("Không tìm thấy bài thi."); return; }
        const data = snap.data();

        setExamTitle(data.title ?? "");
        setDescription(data.description ?? "");
        setScoringConfig({ part1TotalScore: 3, part3TotalScore: 3, part4TotalScore: 3, ...(data.scoringConfig ?? {}) });
        setStructure(normalizeStructure(data.structure));
        setDuration(data.duration ?? 90);
        setStartTime(toDateTimeLocal(data.startTime));
        setEndTime(toDateTimeLocal(data.endTime));
        setHasPassword(Boolean(data.requiresPassword));
        setMaxRetries(data.maxRetries ?? 1);
        setVersioning(normalizeVersioning(data.versioning));
        setIsShared(data.isShared ?? false);
        setGradeLevel(data.gradeLevel ?? GRADE_LEVELS[0]);
        setExamType(data.examType ?? EXAM_TYPES[0]);
        setOriginalAuthorEmail(data.authorEmail ?? "");
        setTargetType(normalizeTargetType(data.targetType));
        setTargetClassIds(data.targetClassIds ?? []);

        const token = await user.getIdToken();
        const sourceResponse = await fetch(`/api/exams/${encodeURIComponent(id)}/source`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const sourcePayload = await sourceResponse.json().catch(() => null) as {
          rawLatex?: { part1?: string; part2?: string; part3?: string; part4?: string };
          error?: string;
        } | null;
        if (!sourceResponse.ok || !sourcePayload?.rawLatex) {
          throw new Error(sourcePayload?.error ?? "SOURCE_NOT_FOUND");
        }
        const source = {
          part1: sourcePayload.rawLatex.part1 ?? "",
          part2: sourcePayload.rawLatex.part2 ?? "",
          part3: sourcePayload.rawLatex.part3 ?? "",
          part4: sourcePayload.rawLatex.part4 ?? "",
        };
        setPart1(source.part1);
        setPart2(source.part2);
        setPart3(source.part3);
        setPart4(source.part4);
        // Ghép các phần đã lưu vào Smart Input và dựng sẵn bản xem trước của đề hiện tại.
        const joined = joinLatexParts(source);
        setSmartInput(joined);
        setSmartCounts(smartParseLatex(joined, { essay: true }).counts);
        setPreviewData({
          title: data.title ?? "",
          questions: orderQuestionsByPart([
            ...parseLatexExam(source.part1),
            ...parseLatexExam(source.part2),
            ...parseLatexExam(source.part3),
            ...parseLatexExam(source.part4, { essay: true }),
          ]),
        });
      } catch (err) {
        console.error(err);
        setLoadError("Không thể tải nguồn LaTeX của bài thi. Vui lòng thử lại.");
      } finally {
        setPageLoading(false);
      }
    };
    load();
  }, [id, user]);

  // Load teacher's classes when switching to "classes" mode
  useEffect(() => {
    if (!assignsClasses(targetType) || !user?.uid || myClasses.length > 0) return;
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

  // ── Compile preview ───────────────────────────────────────────────────────
  const handlePreview = () => {
    if (!examTitle.trim()) { alert("Vui lòng nhập tên bài thi!"); return; }
    if (!smartInput.trim()) { alert("Vui lòng nhập nội dung LaTeX của đề."); return; }
    try {
      const classified = smartParseLatex(smartInput, { essay: true });
      setPart1(classified.part1);
      setPart2(classified.part2);
      setPart3(classified.part3);
      setPart4(classified.part4);
      setSmartCounts(classified.counts);
      if (classified.counts.p4 > 0) setStructure("p1234");
      const all = orderQuestionsByPart([
        ...parseLatexExam(classified.part1),
        ...parseLatexExam(classified.part2),
        ...parseLatexExam(classified.part3),
        ...parseLatexExam(classified.part4, { essay: true }),
      ]);
      setPreviewData({ title: examTitle, questions: all });
      const missingAnswers = getMissingShortAnswerQuestionNumbers(all);
      if (missingAnswers.length > 0) {
        alert(`Cảnh báo: câu ${missingAnswers.join(", ")} chưa có đáp án trả lời ngắn. Hệ thống sẽ không cho cập nhật nội dung cho đến khi bổ sung đáp án.`);
      }
    } catch (err) {
      console.error(err);
      alert("Có lỗi khi biên dịch LaTeX. Vui lòng kiểm tra lại cú pháp.");
    }
  };

  const handleExamFile = async (file: File) => {
    if (!user) return;
    setImportingFile(true);
    setImportWarnings([]);
    setImportSummary(null);
    try {
      const token = await user.getIdToken();
      const payload = await importExamFile(file, token);
      const classified = smartParseLatex(payload.latex, { essay: true });
      setSmartInput(payload.latex);
      setPart1(classified.part1);
      setPart2(classified.part2);
      setPart3(classified.part3);
      setPart4(classified.part4);
      setSmartCounts(classified.counts);
      if (classified.counts.p4 > 0) setStructure("p1234");
      setPreviewData({ title: examTitle.trim() || payload.title || file.name.replace(/\.(docx|pdf|tex)$/i, ""), questions: orderQuestionsByPart(payload.questions) });
      setImportWarnings(payload.warnings ?? []);
      setImportSummary(payload.stats ?? null);
    } catch (error) {
      setImportWarnings([error instanceof Error ? error.message : "Không thể nhập file đề thi."]);
    } finally {
      setImportingFile(false);
    }
  };

  const handleSaveSettings = async () => {
    const isOwnExam = !originalAuthorEmail || originalAuthorEmail === user?.email;
    if (!isOwnExam) {
      alert("Bạn cần tạo bản sao trước khi thay đổi cấu hình của đề này.");
      return;
    }
    if (!examTitle.trim()) {
      alert("Vui lòng nhập tên bài thi.");
      return;
    }
    const timeError = validateTimeRange(startTime, endTime);
    if (timeError) {
      alert(timeError);
      return;
    }
    if (assignsClasses(targetType) && targetClassIds.length === 0) {
      alert("Vui lòng chọn ít nhất một lớp được phép làm bài.");
      return;
    }
    if (newPassword && newPassword.normalize("NFKC").length < 4) {
      alert("Mật khẩu đề thi phải có ít nhất 4 ký tự.");
      return;
    }

    setSavingSettings(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
      const passwordAction = removePassword ? "remove" : newPassword ? "set" : "keep";
      const response = await fetch(`/api/exams/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: "settings",
          title: examTitle.trim(),
          description: description.trim(),
          scoringConfig: {
            part1TotalScore: Number(scoringConfig.part1TotalScore),
            part3TotalScore: Number(scoringConfig.part3TotalScore),
            part4TotalScore: Number(scoringConfig.part4TotalScore ?? 0),
          },
          duration: Number(duration),
          startTime: toStoredDateTime(startTime),
          endTime: toStoredDateTime(endTime),
          maxRetries: Number(maxRetries),
          versioning: normalizeVersioning(versioning),
          gradeLevel,
          examType: gradeLevel === "Thi Thử TN THPT" ? null : examType,
          targetType,
          targetClassIds: assignsClasses(targetType) ? targetClassIds : [],
          isShared,
          passwordAction,
          ...(newPassword ? { password: newPassword } : {}),
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? "Không thể lưu cấu hình.");
      if (passwordAction === "set") setHasPassword(true);
      if (passwordAction === "remove") setHasPassword(false);
      setNewPassword("");
      setRemovePassword(false);
      alert("✓ Đã lưu cấu hình. Nội dung LaTeX và các ảnh TikZ không bị biên dịch lại.");
    } catch (error) {
      console.error(error);
      alert(`❌ ${error instanceof Error ? error.message : "Không thể lưu cấu hình."}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Save: update own exam OR clone shared exam ────────────────────────────
  const handleUpdate = async () => {
    if (!previewData) {
      alert("Vui lòng biên dịch trước khi cập nhật.");
      return;
    }
    const missingAnswers = getMissingShortAnswerQuestionNumbers(previewData.questions);
    if (missingAnswers.length > 0) {
      alert(`Không thể cập nhật: câu ${missingAnswers.join(", ")} đang thiếu đáp án trả lời ngắn.`);
      return;
    }
    const problems = structureProblems(structure, countQuestionsByPart(previewData.questions));
    if (problems.length > 0) {
      alert(`Không thể cập nhật: ${problems.join(" ")}`);
      return;
    }

    // Determine if this is someone else's exam (clone operation)
    const isOwnExam = !originalAuthorEmail || originalAuthorEmail === user?.email;
    if (!isOwnExam) {
      const timeError = validateTimeRange(startTime, endTime);
      if (timeError) {
        alert(timeError);
        return;
      }
      if (newPassword && newPassword.normalize("NFKC").length < 4) {
        alert("Mật khẩu đề thi phải có ít nhất 4 ký tự.");
        return;
      }
    }

    setSaving(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
      const processResponse = await fetch("/api/process-tikz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ questions: previewData.questions }),
      });

      const processed = (await processResponse.json()) as ProcessTikzResponse;
      if (!processResponse.ok) {
        throw new Error(processed.error ?? "Không thể chuyển TikZ sang ảnh.");
      }
      if ((processed.failedCount ?? 0) > 0) {
        const failureDetails = (processed.failures ?? []).slice(0, 6).map((failure) =>
          `• Câu ${failure.questionNumber} (${failure.field === "question" ? "đề bài" : "lời giải"}): ${failure.error}`
        ).join("\n");
        throw new Error(
          `Có ${processed.failedCount} hình TikZ chưa biên dịch được. Nội dung chưa bị ghi đè.` +
          (failureDetails ? `\n\n${failureDetails}` : "")
        );
      }

      const questionsToSave = processed.questions;
      const p1Qs = questionsToSave.filter((q) => q.type === "multiple_choice");
      const p2Qs = questionsToSave.filter((q) => q.type === "true_false");
      const p3Qs = questionsToSave.filter((q) => q.type === "short_answer");

      const examPayload = {
        title: previewData.title,
        description: description.trim(),
        questions: questionsToSave,
        questionCount: questionsToSave.length,
        part1Count: p1Qs.length,
        part2Count: p2Qs.length,
        part3Count: p3Qs.length,
        scoringConfig: {
          part1TotalScore: Number(scoringConfig.part1TotalScore),
          part3TotalScore: Number(scoringConfig.part3TotalScore),
          ...(structure === "p1234" ? { part4TotalScore: explicitEssayTotal(previewData.questions) ?? Number(scoringConfig.part4TotalScore ?? 0) } : {}),
        },
        structure,
        duration: Number(duration),
        startTime: toStoredDateTime(startTime),
        endTime: toStoredDateTime(endTime),
        rawLatex: { part1, part2, part3, ...(structure === "p1234" ? { part4 } : {}) },
        tikzProcessed: processed.tikzProcessed,
        tikzImageCount: processed.convertedCount,
        maxRetries: Number(maxRetries),
        versioning: normalizeVersioning(versioning),
        gradeLevel,
        examType: gradeLevel === "Thi Thử TN THPT" ? null : examType,
        targetType,
        targetClassIds: assignsClasses(targetType) ? targetClassIds : [],
      };

      if (!isOwnExam) {
        // ── CLONE: tạo document mới, không ghi đè đề gốc ─────────────────
        if (!window.confirm(
          "Đây là đề của giáo viên khác.\nHệ thống sẽ TẠO BẢN SAO mới và gán cho bạn (đề gốc không bị thay đổi).\n\nTiếp tục?"
        )) { setSaving(false); return; }

        const cloneResponse = await fetch("/api/upload-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...examPayload, isShared: false, password: newPassword }),
        });
        const clonePayload = await cloneResponse.json().catch(() => null) as { id?: string; error?: string } | null;
        if (!cloneResponse.ok || !clonePayload?.id) throw new Error(clonePayload?.error ?? "Không thể tạo bản sao bài thi.");

        alert("✓ Bản sao đã được tạo và thêm vào kho 'Đề được chia sẻ' của bạn!");
        router.push("/admin/exam-list?tab=shared");
      } else {
        // ── UPDATE: ghi đè đề của chính mình ────────────────────────────
        if (!window.confirm("Biên dịch lại LaTeX/TikZ và thay nội dung câu hỏi hiện tại?\n\nĐiểm, thời gian, mật khẩu và lớp được giao sẽ được giữ nguyên.")) {
          setSaving(false);
          return;
        }

        const updateResponse = await fetch(`/api/exams/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            mode: "content",
            title: examTitle.trim(),
            questions: questionsToSave,
            structure,
            scoringConfig: examPayload.scoringConfig,
            rawLatex: { part1, part2, part3, ...(structure === "p1234" ? { part4 } : {}) },
            tikzProcessed: processed.tikzProcessed,
            tikzImageCount: processed.convertedCount,
          }),
        });
        if (!updateResponse.ok) {
          const payload = await updateResponse.json().catch(() => null) as { error?: string; message?: string } | null;
          throw new Error(payload?.message ?? payload?.error ?? "Không thể cập nhật bài thi.");
        }

        alert("✓ Đã biên dịch và cập nhật nội dung LaTeX/TikZ. Cấu hình bài thi được giữ nguyên.");
      }
    } catch (err) {
      console.error(err);
      alert(`❌ ${err instanceof Error ? err.message : "Lỗi khi lưu. Vui lòng thử lại."}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  // Giáo viên đặt điểm từng câu tự luận ở bản xem trước; tổng Phần IV tự cộng khi đủ mọi câu.
  const handleEssayPoints = (questionId: number, points: number | null) => {
    setPreviewData((prev) => (prev ? { ...prev, questions: withEssayPoints(prev.questions, questionId, points) } : prev));
  };
  // Khi đã đặt điểm cho mọi câu, tổng Phần IV là tổng các câu (không cần ô nhập riêng).
  const explicitPart4Total = structure === "p1234" ? explicitEssayTotal(previewData?.questions ?? []) : null;
  const scoringView: ScoringConfig = explicitPart4Total === null ? scoringConfig : { ...scoringConfig, part4TotalScore: explicitPart4Total };

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
        <p className="text-danger-500 font-semibold text-lg mb-6">{loadError}</p>
        <Link href="/admin/exam-list" className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors">
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  const isOwnExam = !originalAuthorEmail || originalAuthorEmail === user?.email;
  const questions = previewData?.questions ?? [];
  const missingAnswers = getMissingShortAnswerQuestionNumbers(questions);
  const trueFalseCount = questions.filter((question) => question.type === "true_false").length;

  const settingsButton = (extra = "") => (
    <button type="button" onClick={handleSaveSettings} disabled={savingSettings || !isOwnExam} className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50 ${extra}`}>
      {savingSettings ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
      {savingSettings ? "Đang lưu…" : "Lưu thiết lập"}
    </button>
  );
  const contentButton = (extra = "") => (
    <button type="button" onClick={handleUpdate} disabled={saving || !previewData} className={`edu-btn inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${extra}`}>
      {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : isOwnExam ? <RefreshCw size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {saving ? "Đang biên dịch…" : isOwnExam ? "Lưu nội dung đề" : "Tạo bản sao"}
    </button>
  );

  return (
    <AdminGuard>
      <div className="workspace-page mx-auto w-full max-w-[1500px] px-4 pb-6 pt-6 sm:px-6 sm:pt-8 lg:pb-10">
        <header className="mb-6">
          <Link href="/admin/exam-list" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition hover:text-brand-700">
            <ArrowLeft size={16} aria-hidden="true" />Danh sách đề
          </Link>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Chỉnh sửa bài thi</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-gray-500">Thông tin và thiết lập lưu riêng, không biên dịch lại đề. Chỉ bấm <b className="text-gray-700">Lưu nội dung đề</b> khi đã sửa mã LaTeX.</p>
          {!isOwnExam && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              <AlertTriangle size={15} aria-hidden="true" />Đây là đề của giáo viên khác. Khi lưu, hệ thống tạo bản sao cho bạn.
            </p>
          )}
        </header>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(400px,.85fr)]">
          <div className="min-w-0 space-y-6">
            <EditorCard id="exam-content" step={1} icon={FileCode2} title="Nội dung đề" description="Sửa trực tiếp mã LaTeX hoặc tải file mới để thay toàn bộ đề.">
              <div className="mb-4">
                <p className="mb-2 text-sm font-semibold text-gray-800">Cấu trúc đề</p>
                <ExamStructurePicker value={structure} onChange={(value) => { setStructure(value); }} />
                {structureParts(structure).includes("p4") && (
                  <p className="mt-2 text-xs leading-5 text-gray-500">Khối <code className="rounded bg-gray-100 px-1">ex</code> không có lệnh đáp án là câu tự luận; <code className="rounded bg-gray-100 px-1">{"\\loigiai"}</code> là hướng dẫn chấm. Đổi cấu trúc được lưu khi bấm <b>Lưu nội dung đề</b>.</p>
                )}
                {questions.length > 0 && [
                  ...structureProblems(structure, countQuestionsByPart(questions)),
                  ...(structure === "p1234" ? essayPointProblems(questions, Number(scoringView.part4TotalScore ?? 0)) : []),
                ].map((problem) => (
                  <p key={problem} role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-amber-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{problem}</p>
                ))}
              </div>
              <ExamSourceInput
                value={smartInput}
                onChange={(value) => { setSmartInput(value); setPreviewData(null); setSmartCounts(null); }}
                onAnalyze={handlePreview}
                onFile={(file) => void handleExamFile(file)}
                importing={importingFile}
                counts={smartCounts}
                importStats={importSummary}
                warnings={importWarnings}
              />
            </EditorCard>

            <EditorCard id="exam-info" step={2} icon={PenLine} title="Thông tin đề" description="Học sinh nhìn thấy những thông tin này trong kho đề.">
              <ExamInfoFields
                idPrefix="edit"
                title={examTitle}
                onTitle={setExamTitle}
                description={description}
                onDescription={setDescription}
                gradeLevel={gradeLevel}
                onGradeLevel={setGradeLevel}
                examType={examType}
                onExamType={setExamType}
              />
            </EditorCard>

            <EditorCard id="exam-rules" step={3} icon={SlidersHorizontal} title="Thiết lập làm bài" description="Thời gian, điểm số và ai được làm bài.">
              <ExamRulesFields
                idPrefix="edit"
                versioning={versioning}
                onVersioning={setVersioning}
                duration={duration}
                onDuration={setDuration}
                maxRetries={maxRetries}
                onMaxRetries={setMaxRetries}
                startTime={startTime}
                onStartTime={setStartTime}
                endTime={endTime}
                onEndTime={setEndTime}
                scoring={scoringView}
                onScoring={setScoringConfig}
                structure={structure}
                trueFalseCount={trueFalseCount}
                hasQuestions={questions.length > 0}
                passwordSlot={
                  <div className="space-y-3">
                    <Field label={hasPassword ? "Đổi mật khẩu mở đề" : "Đặt mật khẩu mở đề"} optional={!hasPassword} htmlFor="edit-password" hint={hasPassword ? "Đề đang có mật khẩu. Bỏ trống để giữ nguyên." : "Tối thiểu 4 ký tự."}>
                      <input id="edit-password" type="password" autoComplete="new-password" minLength={4} maxLength={128} value={newPassword} disabled={removePassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={hasPassword ? "Mật khẩu mới" : "Tối thiểu 4 ký tự"} className={`${inputClass} h-11`} />
                    </Field>
                    {hasPassword && (
                      <Toggle checked={removePassword} onChange={(checked) => { setRemovePassword(checked); if (checked) setNewPassword(""); }} label="Gỡ mật khẩu" description="Học sinh vào làm bài không cần nhập mật khẩu." />
                    )}
                  </div>
                }
                share={isOwnExam ? { checked: isShared, onChange: setIsShared } : undefined}
                targetType={targetType}
                onTargetType={setTargetType}
                targetClassIds={targetClassIds}
                onTargetClassIds={setTargetClassIds}
                classes={myClasses}
                classesLoading={classesLoading}
              />
            </EditorCard>
          </div>

          <aside aria-label="Lưu và xem trước" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)]">
            <div className="shrink-0 rounded-3xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-soft)]">
              <h2 className="font-display text-base font-bold text-gray-900">Lưu thay đổi</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600"><SlidersHorizontal size={13} aria-hidden="true" /></span>
                  <span className="text-gray-600"><b className="text-gray-900">Lưu thiết lập</b>: tên, mô tả, điểm, thời gian, lớp, mật khẩu. Lưu ngay, không đụng tới câu hỏi và hình TikZ.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700"><FileCode2 size={13} aria-hidden="true" /></span>
                  <span className="text-gray-600"><b className="text-gray-900">{isOwnExam ? "Lưu nội dung đề" : "Tạo bản sao"}</b>: biên dịch lại LaTeX/TikZ theo bản xem trước. {previewData ? "" : "Cần bấm Phân tích & xem trước trước."}</span>
                </li>
              </ul>
              {missingAnswers.length > 0 && (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />Câu {missingAnswers.join(", ")} thiếu đáp án trả lời ngắn.</p>
              )}
              <div className="mt-4 hidden gap-2 lg:grid lg:grid-cols-2">
                {settingsButton()}
                {contentButton()}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[var(--shadow-soft)]">
              <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-5 py-3.5">
                <Eye size={17} className="text-brand-600" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-gray-900">Bản xem trước</h2>
                {questions.length > 0 && <span className="ml-auto text-xs font-medium text-gray-500">{questions.length} câu · {duration} phút</span>}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/60 p-4 sm:p-5">
                {previewData ? (
                  <ExamPreview
                    questions={previewData.questions}
                    title={examTitle.trim() || previewData.title}
                    description={description.trim()}
                    chips={[gradeLevel, ...(gradeLevel !== MOCK_EXAM_GRADE ? [examType] : []), `${duration} phút`]}
                    part4TotalScore={structure === "p1234" ? scoringView.part4TotalScore ?? 0 : undefined}
                    onEssayPointsChange={structure === "p1234" ? handleEssayPoints : undefined}
                  />
                ) : (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                    <StateIcon icon="inbox" tone="muted" />
                    <p className="max-w-xs text-sm text-gray-500">Mã đề vừa thay đổi. Bấm <b className="text-gray-700">Phân tích &amp; xem trước</b> để kiểm tra lại.</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2">
            {settingsButton()}
            {contentButton()}
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
