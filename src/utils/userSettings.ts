import { normalizeTargetType, type ExamTargetType } from "@/utils/examAudience";

/**
 * Cài đặt riêng của mỗi tài khoản, lưu trong users/{uid}.settings.
 * Chỉ giữ những cài đặt thật sự có tác dụng trên website.
 */
export type ExamFontScale = "sm" | "md" | "lg";

export const EXAM_FONT_SCALE: Record<ExamFontScale, number> = { sm: 0.92, md: 1, lg: 1.15 };

/** Giá trị điền sẵn khi giáo viên tạo đề mới. */
export interface ExamDefaults {
  duration: number;
  maxRetries: number;
  part1TotalScore: number;
  part3TotalScore: number;
  gradeLevel: string;
  examType: string;
  targetType: ExamTargetType;
  isShared: boolean;
}

export interface UserSettings {
  /** Cỡ chữ nội dung đề khi làm bài và xem lại. */
  examFontScale: ExamFontScale;
  /** Bạn cùng lớp thấy "Bạn học ẩn danh" thay cho tên trên bảng xếp hạng. */
  hideOnLeaderboard: boolean;
  /** Gửi email kết quả sau khi nộp bài. */
  resultEmail: boolean;
  examDefaults: ExamDefaults;
}

export const DEFAULT_EXAM_DEFAULTS: ExamDefaults = {
  duration: 90,
  maxRetries: 1,
  part1TotalScore: 3,
  part3TotalScore: 3,
  gradeLevel: "Lớp 10",
  examType: "Đề kiểm tra thường xuyên",
  targetType: "all",
  isShared: false,
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  examFontScale: "md",
  hideOnLeaderboard: false,
  resultEmail: true,
  examDefaults: DEFAULT_EXAM_DEFAULTS,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function shortText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function sanitizeExamDefaults(value: unknown, base: ExamDefaults): ExamDefaults {
  const input = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof ExamDefaults, unknown>>;
  return {
    duration: Math.round(clampNumber(input.duration, 1, 600, base.duration)),
    maxRetries: Math.round(clampNumber(input.maxRetries, 0, 100, base.maxRetries)),
    part1TotalScore: clampNumber(input.part1TotalScore, 0, 10, base.part1TotalScore),
    part3TotalScore: clampNumber(input.part3TotalScore, 0, 10, base.part3TotalScore),
    gradeLevel: shortText(input.gradeLevel, base.gradeLevel),
    examType: shortText(input.examType, base.examType),
    targetType: input.targetType === undefined ? base.targetType : normalizeTargetType(input.targetType),
    isShared: typeof input.isShared === "boolean" ? input.isShared : base.isShared,
  };
}

/** Đọc cài đặt đã lưu (có thể thiếu trường) và điền giá trị mặc định. */
export function resolveUserSettings(value: unknown): UserSettings {
  return mergeUserSettings(DEFAULT_USER_SETTINGS, value);
}

/** Gộp phần cài đặt gửi lên vào cài đặt hiện có, bỏ mọi giá trị không hợp lệ. */
export function mergeUserSettings(current: UserSettings, patch: unknown): UserSettings {
  const input = (patch && typeof patch === "object" ? patch : {}) as Partial<Record<keyof UserSettings, unknown>>;
  return {
    examFontScale: input.examFontScale === "sm" || input.examFontScale === "md" || input.examFontScale === "lg"
      ? input.examFontScale
      : current.examFontScale,
    hideOnLeaderboard: typeof input.hideOnLeaderboard === "boolean" ? input.hideOnLeaderboard : current.hideOnLeaderboard,
    resultEmail: typeof input.resultEmail === "boolean" ? input.resultEmail : current.resultEmail,
    examDefaults: input.examDefaults === undefined
      ? current.examDefaults
      : sanitizeExamDefaults(input.examDefaults, current.examDefaults),
  };
}
