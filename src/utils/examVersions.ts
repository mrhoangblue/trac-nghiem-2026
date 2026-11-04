/**
 * Trộn đề nhiều mã. Mỗi mã đề là một hoán vị cố định sinh từ (examId, mã):
 * cùng mã luôn ra cùng thứ tự, nên không cần lưu từng bản đề.
 *
 * Quy ước dữ liệu:
 * - Câu hỏi giữ nguyên `id`; trong mỗi phần chỉ đổi thứ tự hiển thị.
 * - Bản đề đã trộn có `options` và `correctAnswer` theo thứ tự HIỂN THỊ, nên màn
 *   làm bài, chấm tạm và xem lại dùng được như đề thường.
 * - Đáp án lưu lên máy chủ (`answersJson`) luôn theo thứ tự GỐC: chấm điểm, thống
 *   kê từng câu và bảng điểm không phải biết đến mã đề.
 */
import type { ParsedQuestion } from "@/utils/latexParser";
import { questionPart } from "@/utils/examStructure";

export interface ExamVersioning {
  enabled: boolean;
  /** Số mã đề, 2–24. */
  count: number;
  /** Mã đầu tiên; các mã sau tăng dần (101, 102, …). */
  firstCode: number;
  /** Đổi thứ tự câu trong từng phần (Phần IV tự luận giữ nguyên). */
  shuffleQuestions: boolean;
  /** Đổi thứ tự phương án A–D của Phần I. */
  shuffleOptions: boolean;
  /** Đổi thứ tự ý a–d của Phần II. */
  shuffleStatements: boolean;
}

export const VERSION_COUNT_MIN = 2;
export const VERSION_COUNT_MAX = 24;

export const DEFAULT_VERSIONING: ExamVersioning = {
  enabled: false,
  count: 4,
  firstCode: 101,
  shuffleQuestions: true,
  shuffleOptions: true,
  shuffleStatements: false,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function normalizeVersioning(value: unknown): ExamVersioning {
  const raw = value && typeof value === "object" ? value as Partial<ExamVersioning> : {};
  return {
    enabled: raw.enabled === true,
    count: clampInt(raw.count, VERSION_COUNT_MIN, VERSION_COUNT_MAX, DEFAULT_VERSIONING.count),
    firstCode: clampInt(raw.firstCode, 1, 9999 - VERSION_COUNT_MAX, DEFAULT_VERSIONING.firstCode),
    shuffleQuestions: raw.shuffleQuestions !== false,
    shuffleOptions: raw.shuffleOptions !== false,
    shuffleStatements: raw.shuffleStatements === true,
  };
}

/** Danh sách mã đề; rỗng khi không trộn. */
export function versionCodes(value: unknown): string[] {
  const versioning = normalizeVersioning(value);
  if (!versioning.enabled) return [];
  return Array.from({ length: versioning.count }, (_, index) => String(versioning.firstCode + index).padStart(3, "0"));
}

// ── Hoán vị có hạt giống ─────────────────────────────────────────────────────

function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: nhanh, tái lập được, đủ tốt để trộn đề. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Trả về `order` với order[viTriHienThi] = viTriGoc. */
function permutation(length: number, random: () => number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

/**
 * Phương án nhắc tới phương án khác ("Cả A và B", "Tất cả đều đúng") thì trộn sẽ
 * làm sai nghĩa, nên giữ nguyên thứ tự cho câu đó.
 */
const OPTION_REFERENCES = [
  /(?:^|[^\p{L}])(?:cả|tất cả|đều đúng|đều sai|các phương án|không có phương án)(?![\p{L}])/iu,
  /(?:phương án|đáp án|câu) [A-D](?![\p{L}])/iu,
  /(?:^|[^\p{L}])[A-D](?: và| hoặc|,) [A-D](?![\p{L}])/u,
];

export function hasLinkedOptions(question: Pick<ParsedQuestion, "options">): boolean {
  return (question.options ?? []).some((option) => OPTION_REFERENCES.some((pattern) => pattern.test(option)));
}

// ── Dựng bản đề theo mã ──────────────────────────────────────────────────────

export interface VersionOrders {
  /** id câu → thứ tự phương án/ý (order[hienThi] = goc). */
  options: Record<number, number[]>;
}

export interface ExamVersion {
  code: string | null;
  questions: ParsedQuestion[];
  orders: VersionOrders;
}

const PART_ORDER = ["p1", "p2", "p3", "p4"] as const;

export function buildExamVersion(
  questions: ParsedQuestion[],
  versioningValue: unknown,
  code: string | null | undefined,
  examId: string,
): ExamVersion {
  const versioning = normalizeVersioning(versioningValue);
  if (!versioning.enabled || !code || !versionCodes(versioning).includes(code)) {
    return { code: null, questions, orders: { options: {} } };
  }

  const random = mulberry32(hashSeed(`${examId}:${code}`));
  const ordered: ParsedQuestion[] = [];
  for (const part of PART_ORDER) {
    const inPart = questions.filter((question) => questionPart(question.type) === part);
    const order = versioning.shuffleQuestions && part !== "p4" ? permutation(inPart.length, random) : inPart.map((_, index) => index);
    ordered.push(...order.map((index) => inPart[index]));
  }
  // Câu loại lạ (không thuộc phần nào) giữ ở cuối như cũ.
  ordered.push(...questions.filter((question) => !PART_ORDER.includes(questionPart(question.type) as typeof PART_ORDER[number])));

  const orders: VersionOrders = { options: {} };
  const versioned = ordered.map((question) => {
    const options = question.options ?? [];
    const isChoice = question.type === "multiple_choice" && versioning.shuffleOptions && options.length > 1 && !hasLinkedOptions(question);
    const isStatements = question.type === "true_false" && versioning.shuffleStatements && options.length > 1;
    // Luôn rút số ngẫu nhiên cho mọi câu cùng loại để thứ tự các câu sau không đổi khi một câu bị giữ nguyên.
    const order = (question.type === "multiple_choice" || question.type === "true_false") && options.length > 1
      ? permutation(options.length, random)
      : null;
    if (!order || (!isChoice && !isStatements)) return question;

    orders.options[question.id] = order;
    if (isChoice) {
      // Đề gửi cho học sinh khi làm bài không có đáp án (null): chỉ đổi thứ tự phương án.
      const correct = question.correctAnswer === null ? null : order.indexOf(Number(question.correctAnswer));
      return { ...question, options: order.map((index) => options[index]), correctAnswer: correct };
    }
    if (!Array.isArray(question.correctAnswer)) return { ...question, options: order.map((index) => options[index]) };
    const correct = question.correctAnswer;
    return { ...question, options: order.map((index) => options[index]), correctAnswer: order.map((index) => correct[index] ?? false) };
  });

  return { code, questions: versioned, orders };
}

// ── Đổi đáp án giữa thứ tự hiển thị và thứ tự gốc ───────────────────────────

export interface StoredAnswers {
  p1Ans: Record<number, number>;
  p2Ans: Record<number, (boolean | null)[]>;
  p3Ans: Record<number, string>;
}

function mapAnswers(answers: StoredAnswers, orders: VersionOrders, toOriginal: boolean): StoredAnswers {
  const p1Ans: Record<number, number> = {};
  for (const [key, value] of Object.entries(answers.p1Ans ?? {})) {
    const order = orders.options[Number(key)];
    if (!order || typeof value !== "number") { p1Ans[Number(key)] = value; continue; }
    const mapped = toOriginal ? order[value] : order.indexOf(value);
    p1Ans[Number(key)] = mapped === undefined || mapped < 0 ? value : mapped;
  }
  const p2Ans: Record<number, (boolean | null)[]> = {};
  for (const [key, value] of Object.entries(answers.p2Ans ?? {})) {
    const order = orders.options[Number(key)];
    if (!order || !Array.isArray(value)) { p2Ans[Number(key)] = value; continue; }
    const mapped: (boolean | null)[] = new Array(order.length).fill(null);
    order.forEach((original, display) => {
      if (toOriginal) mapped[original] = value[display] ?? null;
      else mapped[display] = value[original] ?? null;
    });
    p2Ans[Number(key)] = mapped;
  }
  return { p1Ans, p2Ans, p3Ans: { ...(answers.p3Ans ?? {}) } };
}

/** Đáp án học sinh chọn trên bản đề → đáp án theo đề gốc (để lưu và chấm). */
export function answersToOriginal(answers: StoredAnswers, orders: VersionOrders): StoredAnswers {
  return mapAnswers(answers, orders, true);
}

/** Đáp án đã lưu theo đề gốc → theo bản đề của học sinh (để hiện lại). */
export function answersToDisplay(answers: StoredAnswers, orders: VersionOrders): StoredAnswers {
  return mapAnswers(answers, orders, false);
}

/** Chọn mã ít người làm nhất; hòa thì chọn ngẫu nhiên để hai bạn ngồi cạnh khó trùng mã. */
export function pickVersionCode(codes: string[], usedCodes: Array<string | null | undefined>): string | null {
  if (!codes.length) return null;
  const counts = new Map(codes.map((code) => [code, 0]));
  for (const code of usedCodes) if (code && counts.has(code)) counts.set(code, (counts.get(code) ?? 0) + 1);
  const least = Math.min(...counts.values());
  const candidates = codes.filter((code) => counts.get(code) === least);
  return candidates[Math.floor(Math.random() * candidates.length)];
}
