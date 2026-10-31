"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Check, Globe2, ImagePlus, Layers, Layers3, ListChecks, ListTodo, Loader2, PenTool, School, Shuffle } from "lucide-react";
import { assignsClasses, type ExamTargetType } from "@/utils/examAudience";
import { EXAM_STRUCTURES, structureParts, type ExamStructure } from "@/utils/examStructure";
import { VERSION_COUNT_MAX, VERSION_COUNT_MIN, versionCodes, type ExamVersioning } from "@/utils/examVersions";
import { GRADE_LEVELS, EXAM_TYPES } from "@/components/Sidebar";
import { ChoiceCards, Field, NumberField, SelectMenu, SubHeading, Toggle, inputClass } from "@/components/exam-editor/EditorKit";

export const MOCK_EXAM_GRADE = "Thi Thử TN THPT";

export interface ScoringConfig {
  part1TotalScore: number;
  part3TotalScore: number;
  /** Tổng điểm Phần IV tự luận (chỉ đề 4 phần). */
  part4TotalScore?: number;
}

/** Chọn cấu trúc đề: quyết định phần nào được có câu và ô điểm nào hiện. */
export function ExamStructurePicker({ value, onChange }: { value: ExamStructure; onChange: (value: ExamStructure) => void }) {
  return (
    <ChoiceCards
      name="Cấu trúc đề"
      value={value}
      onChange={onChange}
      options={EXAM_STRUCTURES.map((item, index) => ({
        value: item.value,
        label: item.label,
        description: item.description,
        icon: [ListChecks, ListTodo, Layers3, PenTool][index],
      }))}
    />
  );
}

/** Trộn đề nhiều mã: mỗi học sinh được giao một mã khi bắt đầu làm bài. */
export function ExamVersioningFields({
  idPrefix,
  value,
  onChange,
  parts,
}: {
  idPrefix: string;
  value: ExamVersioning;
  onChange: (value: ExamVersioning) => void;
  parts: string[];
}) {
  const codes = versionCodes(value);
  return (
    <div className="grid gap-3">
      <Toggle
        checked={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
        label="Trộn thành nhiều mã đề"
        description={value.enabled ? "Học sinh được chia đều các mã khi bắt đầu; mỗi em chỉ thấy bản đề của mình." : "Mọi học sinh làm cùng một thứ tự câu và phương án."}
      />
      {value.enabled && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-3.5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Số mã đề" htmlFor={`${idPrefix}-version-count`} hint={`Từ ${VERSION_COUNT_MIN} đến ${VERSION_COUNT_MAX} mã.`}>
              <NumberField id={`${idPrefix}-version-count`} value={value.count} onChange={(count) => onChange({ ...value, count })} min={VERSION_COUNT_MIN} max={VERSION_COUNT_MAX} unit="mã" parse={(raw) => Number.parseInt(raw, 10)} fallback={4} />
            </Field>
            <Field label="Mã đề đầu tiên" htmlFor={`${idPrefix}-version-first`} hint="Các mã sau tăng dần.">
              <NumberField id={`${idPrefix}-version-first`} value={value.firstCode} onChange={(firstCode) => onChange({ ...value, firstCode })} min={1} max={9999 - VERSION_COUNT_MAX} unit="" parse={(raw) => Number.parseInt(raw, 10)} fallback={101} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Các mã đề">
            <Shuffle size={15} className="mr-0.5 text-brand-600" aria-hidden="true" />
            {codes.map((code) => (
              <span key={code} className="rounded-lg bg-white px-2 py-1 font-display text-xs font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">{code}</span>
            ))}
          </div>
          <div className="mt-3 grid gap-2">
            <Toggle checked={value.shuffleQuestions} onChange={(shuffleQuestions) => onChange({ ...value, shuffleQuestions })} label="Đổi thứ tự câu trong từng phần" description={parts.includes("p4") ? "Câu không chuyển sang phần khác. Phần IV tự luận giữ nguyên thứ tự." : "Câu không chuyển sang phần khác."} />
            <Toggle checked={value.shuffleOptions} onChange={(shuffleOptions) => onChange({ ...value, shuffleOptions })} label="Trộn phương án A, B, C, D (Phần I)" description="Câu có phương án kiểu “Cả A và B”, “Tất cả đều đúng” được giữ nguyên thứ tự." />
            {parts.includes("p2") && (
              <Toggle checked={value.shuffleStatements} onChange={(shuffleStatements) => onChange({ ...value, shuffleStatements })} label="Trộn ý a, b, c, d (Phần II)" description="Tắt nếu các ý của câu được sắp theo mạch từ dễ đến khó." />
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500">Lời giải nhắc tới chữ cái phương án (ví dụ “Chọn B”) sẽ không khớp sau khi trộn; trang xem lại luôn ghi rõ đáp án đúng của từng mã.</p>
        </div>
      )}
    </div>
  );
}

export interface ClassOption {
  id: string;
  name: string;
}

export function ExamInfoFields({
  idPrefix,
  title,
  onTitle,
  description,
  onDescription,
  gradeLevel,
  onGradeLevel,
  examType,
  onExamType,
  cover,
}: {
  idPrefix: string;
  title: string;
  onTitle: (value: string) => void;
  description: string;
  onDescription: (value: string) => void;
  gradeLevel: string;
  onGradeLevel: (value: string) => void;
  examType: string;
  onExamType: (value: string) => void;
  cover?: {
    url: string;
    onUrl: (value: string) => void;
    uploading: boolean;
    error: string;
    onUpload: (file: File) => void;
  };
}) {
  const isMock = gradeLevel === MOCK_EXAM_GRADE;
  return (
    <div className="space-y-5">
      <Field label="Tên bài thi" htmlFor={`${idPrefix}-title`} hint={title ? undefined : "Tải file đề sẽ tự điền tên nếu ô này đang trống."}>
        <input id={`${idPrefix}-title`} value={title} onChange={(event) => onTitle(event.target.value)} placeholder="Ví dụ: Kiểm tra giữa học kỳ I – Toán 12" className={`${inputClass} h-12 text-base font-medium`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phân loại" htmlFor={`${idPrefix}-grade`}>
          <SelectMenu id={`${idPrefix}-grade`} value={gradeLevel} options={GRADE_LEVELS} onChange={onGradeLevel} />
        </Field>
        <Field label="Loại đề" htmlFor={`${idPrefix}-type`} hint={isMock ? "Không áp dụng cho đề thi thử TN THPT." : undefined}>
          <SelectMenu id={`${idPrefix}-type`} value={examType} options={EXAM_TYPES} onChange={onExamType} disabled={isMock} />
        </Field>
      </div>
      <Field label="Mô tả" optional htmlFor={`${idPrefix}-description`} hint={<span className="flex justify-between gap-3"><span>Hiện trên thẻ đề và màn hình bắt đầu làm bài.</span><span className="tabular-nums">{description.length}/1000</span></span>}>
        <textarea id={`${idPrefix}-description`} rows={3} maxLength={1000} value={description} onChange={(event) => onDescription(event.target.value)} placeholder="Nội dung trọng tâm, phạm vi kiến thức, lưu ý trước khi làm bài…" className={`${inputClass} resize-y py-3 leading-6`} />
      </Field>
      {cover && (
        <Field label="Ảnh bìa" optional htmlFor={`${idPrefix}-cover`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-indigo-50 to-violet-50 sm:w-44">
              {/^https?:\/\//i.test(cover.url)
                ? <Image src={cover.url} alt="Xem trước ảnh bìa" fill unoptimized className="object-cover" />
                : <span className="absolute inset-0 flex items-center justify-center text-brand-300"><ImagePlus size={28} aria-hidden="true" /></span>}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <input id={`${idPrefix}-cover`} type="url" value={cover.url} onChange={(event) => cover.onUrl(event.target.value)} placeholder="Dán liên kết ảnh https://…" className={`${inputClass} h-11`} />
              <label className={`relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700 ${cover.uploading ? "pointer-events-none opacity-60" : ""}`}>
                {cover.uploading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={15} aria-hidden="true" />}
                {cover.uploading ? "Đang tải ảnh…" : "Tải ảnh từ máy"}
                <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={cover.uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) cover.onUpload(file); event.target.value = ""; }} />
              </label>
              {cover.error && <p role="alert" className="text-xs font-semibold leading-5 text-rose-600">{cover.error}</p>}
            </div>
          </div>
        </Field>
      )}
    </div>
  );
}

export function ExamRulesFields({
  idPrefix,
  duration,
  onDuration,
  maxRetries,
  onMaxRetries,
  startTime,
  onStartTime,
  endTime,
  onEndTime,
  scoring,
  onScoring,
  structure,
  trueFalseCount,
  hasQuestions,
  passwordSlot,
  share,
  targetType,
  onTargetType,
  targetClassIds,
  onTargetClassIds,
  classes,
  classesLoading,
  versioning,
  onVersioning,
}: {
  idPrefix: string;
  duration: number;
  onDuration: (value: number) => void;
  maxRetries: number;
  onMaxRetries: (value: number) => void;
  startTime: string;
  onStartTime: (value: string) => void;
  endTime: string;
  onEndTime: (value: string) => void;
  scoring: ScoringConfig;
  onScoring: (value: ScoringConfig) => void;
  structure: ExamStructure;
  trueFalseCount: number;
  hasQuestions: boolean;
  passwordSlot: ReactNode;
  share?: { checked: boolean; onChange: (checked: boolean) => void };
  targetType: ExamTargetType;
  onTargetType: (value: ExamTargetType) => void;
  targetClassIds: string[];
  onTargetClassIds: (value: string[]) => void;
  classes: ClassOption[];
  classesLoading: boolean;
  versioning?: ExamVersioning;
  onVersioning?: (value: ExamVersioning) => void;
}) {
  const parts = structureParts(structure);
  const maxScore = Math.round((
    (parts.includes("p1") ? scoring.part1TotalScore : 0)
    + (parts.includes("p2") ? trueFalseCount : 0)
    + (parts.includes("p3") ? scoring.part3TotalScore : 0)
    + (parts.includes("p4") ? scoring.part4TotalScore ?? 0 : 0)
  ) * 100) / 100;
  const toggleClass = (classId: string) =>
    onTargetClassIds(targetClassIds.includes(classId) ? targetClassIds.filter((id) => id !== classId) : [...targetClassIds, classId]);

  return (
    <div className="space-y-7">
      <div>
        <SubHeading>Thời gian</SubHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Thời lượng làm bài" htmlFor={`${idPrefix}-duration`}>
            <NumberField id={`${idPrefix}-duration`} value={duration} onChange={onDuration} min={1} max={300} step={5} unit="phút" parse={(raw) => Number.parseInt(raw, 10)} fallback={90} />
          </Field>
          <Field label="Số lần được làm" htmlFor={`${idPrefix}-retries`} hint="Đặt 0 nếu không giới hạn.">
            <NumberField id={`${idPrefix}-retries`} value={maxRetries} onChange={onMaxRetries} min={0} unit={maxRetries === 0 ? "∞" : "lần"} parse={(raw) => Number.parseInt(raw, 10)} />
          </Field>
          <Field label="Mở đề lúc" htmlFor={`${idPrefix}-start`} hint="Bỏ trống để mở ngay.">
            <input id={`${idPrefix}-start`} type="datetime-local" value={startTime} onChange={(event) => onStartTime(event.target.value)} className={`${inputClass} h-11`} />
          </Field>
          <Field label="Đóng đề lúc" htmlFor={`${idPrefix}-end`} hint="Bỏ trống nếu không giới hạn.">
            <input id={`${idPrefix}-end`} type="datetime-local" value={endTime} onChange={(event) => onEndTime(event.target.value)} className={`${inputClass} h-11`} />
          </Field>
        </div>
      </div>

      <div>
        <SubHeading>Điểm số</SubHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phần I · Nhiều phương án" htmlFor={`${idPrefix}-p1`} hint="Chia đều cho số câu.">
            <NumberField id={`${idPrefix}-p1`} value={scoring.part1TotalScore} onChange={(value) => onScoring({ ...scoring, part1TotalScore: value })} step={0.25} unit="điểm" />
          </Field>
          {parts.includes("p3") && (
            <Field label="Phần III · Trả lời ngắn" htmlFor={`${idPrefix}-p3`} hint="Chia đều cho số câu.">
              <NumberField id={`${idPrefix}-p3`} value={scoring.part3TotalScore} onChange={(value) => onScoring({ ...scoring, part3TotalScore: value })} step={0.25} unit="điểm" />
            </Field>
          )}
          {parts.includes("p4") && (
            <Field label="Phần IV · Tự luận" htmlFor={`${idPrefix}-p4`} hint={<>Chia đều cho các câu; câu nào khác điểm thì ghi <code className="rounded bg-gray-100 px-1">{"\\diem{1,5}"}</code> trong khối ex.</>}>
              <NumberField id={`${idPrefix}-p4`} value={scoring.part4TotalScore ?? 0} onChange={(value) => onScoring({ ...scoring, part4TotalScore: value })} step={0.25} unit="điểm" />
            </Field>
          )}
        </div>
        {parts.includes("p2") && <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/70 p-3.5">
          <p className="text-sm font-semibold text-gray-700">Phần II · Đúng/Sai <span className="font-normal text-gray-500">(theo quy chế, mỗi câu tối đa 1 điểm)</span></p>
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs">
            {[["1 ý", "0,1"], ["2 ý", "0,25"], ["3 ý", "0,5"], ["4 ý", "1"]].map(([label, score]) => (
              <div key={label} className="rounded-lg bg-white px-1 py-1.5 ring-1 ring-gray-200"><span className="block text-gray-500">{label}</span><span className="font-display font-bold text-gray-900">{score}đ</span></div>
            ))}
          </div>
        </div>}
        {hasQuestions && (
          <p className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${maxScore === 10 ? "text-emerald-700" : "text-amber-700"}`}>
            {maxScore === 10 ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
            Tổng điểm tối đa: {String(maxScore).replace(".", ",")} điểm{maxScore === 10 ? "" : " (thường là 10)"}
          </p>
        )}
      </div>

      {versioning && onVersioning && (
        <div>
          <SubHeading>Trộn đề</SubHeading>
          <ExamVersioningFields idPrefix={idPrefix} value={versioning} onChange={onVersioning} parts={parts} />
        </div>
      )}

      <div>
        <SubHeading>Ai được làm bài</SubHeading>
        <ChoiceCards
          name="Đối tượng làm bài"
          value={targetType}
          onChange={onTargetType}
          columns={3}
          options={[
            { value: "all", label: "Công khai", description: "Hiện ở kho đề, ai có link đều làm được", icon: Globe2 },
            { value: "classes", label: "Chỉ lớp được giao", description: "Ẩn khỏi kho đề, chỉ học sinh trong lớp làm được", icon: School },
            { value: "both", label: "Công khai + giao lớp", description: "Ai có link đều làm được, đồng thời giao vào lớp", icon: Layers },
          ]}
        />
        {assignsClasses(targetType) && (
          <div className="mt-3 rounded-2xl border border-gray-200 p-3.5">
            {classesLoading ? (
              <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={15} className="animate-spin" aria-hidden="true" />Đang tải danh sách lớp…</p>
            ) : classes.length === 0 ? (
              <p className="text-sm text-gray-500">Bạn chưa có lớp nào. <Link href="/teacher/classes" className="font-semibold text-brand-700 underline">Tạo lớp</Link></p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {classes.map((cls) => {
                    const selected = targetClassIds.includes(cls.id);
                    return (
                      <button key={cls.id} type="button" aria-pressed={selected} onClick={() => toggleClass(cls.id)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition ${selected ? "border-brand-500 bg-brand-600 text-white shadow-sm" : "border-gray-200 bg-white text-gray-700 hover:border-brand-300"}`}>
                        {selected && <Check size={14} aria-hidden="true" />}{cls.name}
                      </button>
                    );
                  })}
                </div>
                {targetClassIds.length === 0 && <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700"><AlertTriangle size={13} aria-hidden="true" />Chọn ít nhất một lớp.</p>}
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <SubHeading>Bảo mật &amp; chia sẻ</SubHeading>
        <div className="grid gap-3">
          {passwordSlot}
          {share && (
            <Toggle
              checked={share.checked}
              onChange={share.onChange}
              label="Chia sẻ cho giáo viên khác"
              description={share.checked ? "Giáo viên khác có thể xem và nhân bản đề này." : "Chỉ bạn thấy đề này trong kho đề."}
            />
          )}
        </div>
      </div>
    </div>
  );
}
