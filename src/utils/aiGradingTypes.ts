/** Kết quả chấm nháp của AI cho phần tự luận; chỉ giáo viên chấm bài thấy. */
export type AiConfidence = "high" | "medium" | "low";

export interface AiStepResult {
  /** Điểm tối đa của ý (theo \buoc). */
  points: number;
  /** Điểm AI đề xuất cho ý này. */
  awarded: number;
  /** Chỗ trong bài làm mà AI dựa vào (trích hoặc mô tả ngắn). */
  evidence: string;
}

export interface AiQuestionResult {
  questionId: number;
  score: number;
  max: number;
  confidence: AiConfidence;
  /** AI không đọc được (hoặc không tìm thấy) bài làm của câu này. */
  unreadable: boolean;
  comment: string;
  /** Rỗng khi câu không có thang chấm \buoc. */
  steps: AiStepResult[];
}

export interface AiGradingResult {
  questions: AiQuestionResult[];
  generalComment: string;
  model: string;
  gradedAtMillis: number;
  usage: { inputTokens: number; outputTokens: number } | null;
}
