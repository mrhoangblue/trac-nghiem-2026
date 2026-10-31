"use client";

import { useState, useEffect } from "react";
import { Check, Eye, FileCode2, Loader2, PenLine, Save, SlidersHorizontal } from "lucide-react";
import { getMissingShortAnswerQuestionNumbers, parseLatexExam, ParsedQuestion } from "@/utils/latexParser";
import { smartParseLatex, type SmartParseCounts } from "@/utils/smartParseLatex";
import { countQuestionsByPart, orderQuestionsByPart, structureParts, structureProblems, type ExamStructure } from "@/utils/examStructure";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import { GRADE_LEVELS, EXAM_TYPES } from "@/components/Sidebar";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import type { ClassDoc } from "@/utils/classroomTypes";
import { toStoredDateTime, validateTimeRange } from "@/utils/examSchedule";
import StateIcon from "@/components/StateIcon";
import { Checklist, EditorCard, Field, inputClass, type ChecklistItem } from "@/components/exam-editor/EditorKit";
import ExamSourceInput from "@/components/exam-editor/ExamSourceInput";
import ExamPreview from "@/components/exam-editor/ExamPreview";
import { importExamFile, type FileImportResponse } from "@/components/exam-editor/importExamFile";
import { ExamInfoFields, ExamRulesFields, ExamStructurePicker, MOCK_EXAM_GRADE, type ClassOption, type ScoringConfig } from "@/components/exam-editor/ExamSettingsFields";
import { assignsClasses, type ExamTargetType } from "@/utils/examAudience";
import { DEFAULT_VERSIONING, normalizeVersioning, type ExamVersioning } from "@/utils/examVersions";
import { resolveUserSettings } from "@/utils/userSettings";

interface UploadQuizResponse {
  id?: string;
  convertedCount: number;
  failedCount?: number;
  tikzProcessed: boolean;
  error?: string;
}


// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreateExamPage() {
  const { user, userProfile } = useAuth();

  const [examTitle, setExamTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [part1, setPart1] = useState("");
  const [part2, setPart2] = useState("");
  const [part3, setPart3] = useState("");
  const [part4, setPart4] = useState("");
  const [structure, setStructure] = useState<ExamStructure>("p123");
  const [saving, setSaving] = useState(false);

  // Smart input
  const [smartInput, setSmartInput] = useState("");
  const [smartResult, setSmartResult] = useState<{ counts: SmartParseCounts } | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<FileImportResponse["stats"] | null>(null);
  const [importSourceObject, setImportSourceObject] = useState<FileImportResponse["sourceObject"]>(null);

  // Điền sẵn theo "Mặc định khi tạo đề" ở trang Tài khoản.
  const examDefaults = resolveUserSettings(userProfile?.settings).examDefaults;
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig>({
    part1TotalScore: examDefaults.part1TotalScore,
    part3TotalScore: examDefaults.part3TotalScore,
    part4TotalScore: 3,
  });
  const [duration, setDuration] = useState(examDefaults.duration);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [examPassword, setExamPassword] = useState("");

  // ── New fields ─────────────────────────────────────────────────────────────
  const [maxRetries, setMaxRetries] = useState(examDefaults.maxRetries);
  const [versioning, setVersioning] = useState<ExamVersioning>(DEFAULT_VERSIONING);
  const [isShared, setIsShared] = useState(examDefaults.isShared);
  const [gradeLevel, setGradeLevel] = useState<string>(
    (GRADE_LEVELS as readonly string[]).includes(examDefaults.gradeLevel) ? examDefaults.gradeLevel : GRADE_LEVELS[0],
  );
  const [examType, setExamType] = useState<string>(
    (EXAM_TYPES as readonly string[]).includes(examDefaults.examType) ? examDefaults.examType : EXAM_TYPES[0],
  );

  // ── Target audience ─────────────────────────────────────────────────────────
  const [targetType, setTargetType] = useState<ExamTargetType>(examDefaults.targetType);
  const [targetClassIds, setTargetClassIds] = useState<string[]>([]);
  const [myClasses, setMyClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);

  const [previewData, setPreviewData] = useState<{
    title: string;
    questions: ParsedQuestion[];
  } | null>(null);

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

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSmartClassify = () => {
    if (!smartInput.trim()) {
      alert("Vui lòng nhập nội dung LaTeX vào ô bên dưới.");
      return;
    }
    const result = smartParseLatex(smartInput, { essay: true });
    setPart1(result.part1);
    setPart2(result.part2);
    setPart3(result.part3);
    setPart4(result.part4);
    setSmartResult({ counts: result.counts });
    if (result.counts.p4 > 0) setStructure("p1234");
    const questions = orderQuestionsByPart([
      ...parseLatexExam(result.part1),
      ...parseLatexExam(result.part2),
      ...parseLatexExam(result.part3),
      ...parseLatexExam(result.part4),
    ]);
    setPreviewData({ title: examTitle.trim() || "Đề thi chưa đặt tên", questions });
    const missingAnswers = getMissingShortAnswerQuestionNumbers(questions);
    if (missingAnswers.length > 0) {
      alert(`Cảnh báo: câu ${missingAnswers.join(", ")} chưa có đáp án trả lời ngắn. Hệ thống sẽ không cho lưu cho đến khi bổ sung đáp án.`);
    }
  };

  const handleCoverImage = async (file: File | null) => {
    if (!file || !user) return;
    setUploadingCover(true);
    setCoverError("");
    try {
      const token = await user.getIdToken();
      const presignResponse = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size, folder: "exam-assets" }),
      });
      const payload = (await presignResponse.json().catch(() => null)) as { uploadUrl?: string; url?: string; contentType?: string; error?: string } | null;
      if (!presignResponse.ok || !payload?.uploadUrl || !payload.url) {
        throw new Error(payload?.error === "FILE_SIZE_INVALID" ? "Ảnh phải nhỏ hơn 8 MB." : "R2 chưa sẵn sàng để lưu ảnh. Bạn vẫn có thể dán URL ảnh công khai.");
      }
      const uploadResponse = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": payload.contentType || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Không thể tải ảnh lên R2. Hãy kiểm tra CORS của bucket.");
      setCoverImageUrl(payload.url);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "Không thể tải ảnh minh họa.");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleExamFile = async (file: File | null) => {
    if (!file || !user) return;
    setImportingFile(true);
    setImportWarnings([]);
    setImportSummary(null);
    setImportSourceObject(null);
    try {
      const token = await user.getIdToken();
      const payload = await importExamFile(file, token);

      const classified = smartParseLatex(payload.latex, { essay: true });
      const importedTitle = examTitle.trim() || payload.title || file.name.replace(/\.(docx|pdf|tex)$/i, "");
      setExamTitle(importedTitle);
      setSmartInput(payload.latex);
      setPart1(classified.part1);
      setPart2(classified.part2);
      setPart3(classified.part3);
      setPart4(classified.part4);
      setSmartResult({ counts: classified.counts });
      if (classified.counts.p4 > 0) setStructure("p1234");
      setPreviewData({ title: importedTitle, questions: orderQuestionsByPart(payload.questions) });
      setImportWarnings(payload.warnings ?? []);
      setImportSummary(payload.stats ?? null);
      setImportSourceObject(payload.sourceObject ?? null);
    } catch (error) {
      setImportWarnings([error instanceof Error ? error.message : "Không thể nhập file đề thi."]);
    } finally {
      setImportingFile(false);
    }
  };

  const handleSave = async () => {
    if (!previewData) return;
    if (!examTitle.trim()) {
      alert("Vui lòng nhập tên bài thi.");
      return;
    }
    if (previewData.questions.length === 0) {
      alert("Đề thi chưa có câu hỏi hợp lệ. Vui lòng kiểm tra Smart Input.");
      return;
    }
    const missingAnswers = getMissingShortAnswerQuestionNumbers(previewData.questions);
    if (missingAnswers.length > 0) {
      alert(`Không thể lưu: câu ${missingAnswers.join(", ")} đang thiếu đáp án trả lời ngắn.`);
      return;
    }
    if (assignsClasses(targetType) && targetClassIds.length === 0) {
      alert("Vui lòng chọn ít nhất một lớp được làm bài.");
      return;
    }
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
          title: examTitle.trim(),
          description: description.trim(),
          questions: previewData.questions,
          scoringConfig: {
            part1TotalScore: Number(scoringConfig.part1TotalScore),
            part3TotalScore: Number(scoringConfig.part3TotalScore),
            ...(structure === "p1234" ? { part4TotalScore: Number(scoringConfig.part4TotalScore ?? 0) } : {}),
          },
          structure,
          duration: Number(duration),
          startTime: toStoredDateTime(startTime),
          endTime: toStoredDateTime(endTime),
          password: examPassword,
          rawLatex: { part1, part2, part3, ...(structure === "p1234" ? { part4 } : {}) },
          authorEmail: user?.email ?? "",
          maxRetries: Number(maxRetries),
          versioning: normalizeVersioning(versioning),
          isShared,
          gradeLevel,
          examType: gradeLevel === "Thi Thử TN THPT" ? null : examType,
          targetType,
          targetClassIds: assignsClasses(targetType) ? targetClassIds : [],
          importSourceObject,
          coverImageUrl,
        }),
      });

      const uploaded = (await uploadResponse.json()) as UploadQuizResponse & { message?: string; failures?: Array<{ questionNumber: number; field: string; error: string }> };
      if (!uploadResponse.ok) {
        const details = uploaded.failures?.slice(0, 5).map((failure) =>
          `Câu ${failure.questionNumber} (${failure.field === "question" ? "đề bài" : "lời giải"}): ${failure.error}`
        ).join("\n");
        throw new Error(`${uploaded.message ?? uploaded.error ?? "Không thể lưu bài thi."}${details ? `\n\n${details}` : ""}`);
      }

      alert(`✓ Đã lưu bài thi. ${uploaded.convertedCount ?? 0} hình TikZ đã được lưu lên R2.`);
      setExamTitle(""); setDescription(""); setCoverImageUrl(""); setPart1(""); setPart2(""); setPart3(""); setPart4(""); setStructure("p123");
      setSmartInput(""); setSmartResult(null); setPreviewData(null);
      setScoringConfig({ part1TotalScore: 3, part3TotalScore: 3, part4TotalScore: 3 });
      setDuration(90); setStartTime(""); setEndTime(""); setExamPassword("");
      setMaxRetries(1); setIsShared(false);
      setGradeLevel(GRADE_LEVELS[0]); setExamType(EXAM_TYPES[0]);
      setTargetType("all"); setTargetClassIds([]);
      setImportWarnings([]); setImportSummary(null); setImportSourceObject(null);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Lỗi khi lưu bài thi. Vui lòng thử lại.";
      alert(`❌ ${message.slice(0, 2200)}`);
    } finally {
      setSaving(false);
    }
  };

  const questions = previewData?.questions ?? [];
  const missingAnswers = getMissingShortAnswerQuestionNumbers(questions);
  const timeError = validateTimeRange(startTime, endTime);
  const checklist: ChecklistItem[] = [
    { label: questions.length ? `Đã nhận ${questions.length} câu hỏi` : "Nhập nội dung đề", ok: questions.length > 0, hint: "Dán LaTeX rồi bấm Phân tích, hoặc tải file đề." },
    { label: "Đặt tên bài thi", ok: Boolean(examTitle.trim()) },
    ...(questions.length ? structureProblems(structure, countQuestionsByPart(questions)).map((problem) => ({ label: "Câu hỏi khớp cấu trúc đề", ok: false, hint: problem })) : []),
    ...(questions.length ? [{ label: "Đủ đáp án trả lời ngắn", ok: missingAnswers.length === 0, hint: `Thiếu đáp án câu ${missingAnswers.join(", ")}.` }] : []),
    ...(assignsClasses(targetType) ? [{ label: "Chọn lớp được giao", ok: targetClassIds.length > 0 }] : []),
    ...(timeError ? [{ label: "Khung thời gian hợp lệ", ok: false, hint: timeError }] : []),
  ];
  const ready = checklist.every((item) => item.ok);
  const trueFalseCount = questions.filter((question) => question.type === "true_false").length;
  const saveButton = (extra = "") => (
    <button type="button" onClick={handleSave} disabled={!ready || saving} className={`edu-btn inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50 ${extra}`}>
      {saving ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
      {saving ? "Đang lưu và vẽ hình TikZ…" : "Lưu bài thi"}
    </button>
  );

  return (
    <AdminGuard>
      <div className="workspace-page mx-auto w-full max-w-[1500px] px-4 pb-6 pt-6 sm:px-6 sm:pt-8 lg:pb-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-600">Ngân hàng đề</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Tạo bài thi mới</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray-500">Dán mã LaTeX hoặc tải file đề, kiểm tra bản xem trước bên phải rồi lưu.</p>
          </div>
          <ol className="hidden items-center gap-2 text-xs font-semibold md:flex" aria-label="Các bước">
            {[
              { label: "Nội dung", done: questions.length > 0, href: "#exam-content" },
              { label: "Thông tin", done: Boolean(examTitle.trim()), href: "#exam-info" },
              { label: "Thiết lập", done: !timeError && (!assignsClasses(targetType) || targetClassIds.length > 0), href: "#exam-rules" },
            ].map((step, index) => (
              <li key={step.label} className="flex items-center gap-2">
                {index > 0 && <span className="h-px w-6 bg-gray-300" aria-hidden="true" />}
                <a href={step.href} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 transition ${step.done ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:text-brand-700"}`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${step.done ? "bg-emerald-500 text-white" : "bg-gray-100"}`}>{step.done ? <Check size={12} aria-hidden="true" /> : index + 1}</span>
                  {step.label}
                </a>
              </li>
            ))}
          </ol>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(400px,.85fr)]">
          <div className="min-w-0 space-y-6">
            <EditorCard id="exam-content" step={1} icon={FileCode2} title="Nội dung đề" description="Chọn cấu trúc đề, Smart Input tự tách các phần." done={questions.length > 0}>
              <div className="mb-4">
                <p className="mb-2 text-sm font-semibold text-gray-800">Cấu trúc đề</p>
                <ExamStructurePicker value={structure} onChange={setStructure} />
                {structureParts(structure).includes("p4") && (
                  <p className="mt-2 text-xs leading-5 text-gray-500">Khối <code className="rounded bg-gray-100 px-1">ex</code> không có <code className="rounded bg-gray-100 px-1">{"\\choice"}</code>, <code className="rounded bg-gray-100 px-1">{"\\choiceTF"}</code>, <code className="rounded bg-gray-100 px-1">{"\\shortans"}</code> là câu tự luận. <code className="rounded bg-gray-100 px-1">{"\\loigiai"}</code> của câu tự luận là hướng dẫn chấm, học sinh không thấy.</p>
                )}
              </div>
              <ExamSourceInput
                value={smartInput}
                onChange={(value) => { setSmartInput(value); setSmartResult(null); setPreviewData(null); }}
                onAnalyze={handleSmartClassify}
                onFile={(file) => void handleExamFile(file)}
                importing={importingFile}
                counts={smartResult?.counts ?? null}
                importStats={importSummary ?? null}
                warnings={importWarnings}
              />
            </EditorCard>

            <EditorCard id="exam-info" step={2} icon={PenLine} title="Thông tin đề" description="Học sinh nhìn thấy những thông tin này trong kho đề." done={Boolean(examTitle.trim())}>
              <ExamInfoFields
                idPrefix="create"
                title={examTitle}
                onTitle={setExamTitle}
                description={description}
                onDescription={setDescription}
                gradeLevel={gradeLevel}
                onGradeLevel={setGradeLevel}
                examType={examType}
                onExamType={setExamType}
                cover={{
                  url: coverImageUrl,
                  onUrl: (value) => { setCoverImageUrl(value); setCoverError(""); },
                  uploading: uploadingCover,
                  error: coverError,
                  onUpload: (file) => void handleCoverImage(file),
                }}
              />
            </EditorCard>

            <EditorCard id="exam-rules" step={3} icon={SlidersHorizontal} title="Thiết lập làm bài" description="Thời gian, điểm số và ai được làm bài.">
              <ExamRulesFields
                idPrefix="create"
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
                scoring={scoringConfig}
                onScoring={setScoringConfig}
                structure={structure}
                trueFalseCount={trueFalseCount}
                hasQuestions={questions.length > 0}
                passwordSlot={
                  <Field label="Mật khẩu mở đề" optional htmlFor="create-password" hint="Được mã hóa một chiều, không lưu cùng nội dung đề.">
                    <input id="create-password" type="password" autoComplete="new-password" minLength={4} maxLength={128} value={examPassword} onChange={(event) => setExamPassword(event.target.value)} placeholder="Tối thiểu 4 ký tự" className={`${inputClass} h-11`} />
                  </Field>
                }
                share={{ checked: isShared, onChange: setIsShared }}
                targetType={targetType}
                onTargetType={setTargetType}
                targetClassIds={targetClassIds}
                onTargetClassIds={setTargetClassIds}
                classes={myClasses}
                classesLoading={classesLoading}
              />
            </EditorCard>
          </div>

          <aside aria-label="Kiểm tra và xem trước" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)]">
            <div className="shrink-0 rounded-3xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-bold text-gray-900">{ready ? "Sẵn sàng lưu" : "Còn thiếu"}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{checklist.filter((item) => item.ok).length}/{checklist.length}</span>
              </div>
              <div className="mt-3"><Checklist items={checklist} /></div>
              {saveButton("mt-4 hidden w-full lg:inline-flex")}
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
                    coverImageUrl={coverImageUrl}
                    chips={[gradeLevel, ...(gradeLevel !== MOCK_EXAM_GRADE ? [examType] : []), `${duration} phút`]}
                    part4TotalScore={structure === "p1234" ? scoringConfig.part4TotalScore ?? 0 : undefined}
                  />
                ) : (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                    <StateIcon icon="inbox" tone="muted" />
                    <p className="max-w-xs text-sm text-gray-500">Đề sẽ hiện ở đây sau khi bạn bấm <b className="text-gray-700">Phân tích &amp; xem trước</b> hoặc tải file đề.</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <p className="min-w-0 flex-1 text-xs text-gray-500">
              <span className="block font-semibold text-gray-900">{ready ? "Sẵn sàng lưu" : `Còn ${checklist.filter((item) => !item.ok).length} mục chưa xong`}</span>
              {questions.length > 0 ? `${questions.length} câu hỏi` : "Chưa có câu hỏi"}
            </p>
            {saveButton("shrink-0")}
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
