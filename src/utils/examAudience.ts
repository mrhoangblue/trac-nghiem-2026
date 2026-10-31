/**
 * Ai được làm một đề:
 * - "all": công khai, hiện ở kho đề trang chủ, ai có link đều làm được.
 * - "classes": chỉ giao cho lớp, ẩn khỏi kho đề, chỉ học sinh trong lớp làm được.
 * - "both": công khai như "all" và đồng thời giao cho lớp (hiện trong trang lớp).
 */
export type ExamTargetType = "all" | "classes" | "both";

export function normalizeTargetType(value: unknown): ExamTargetType {
  return value === "classes" || value === "both" ? value : "all";
}

/** Đề có gắn danh sách lớp được giao hay không. */
export function assignsClasses(targetType: unknown): boolean {
  const type = normalizeTargetType(targetType);
  return type === "classes" || type === "both";
}

/** Chỉ lớp được giao mới làm được và đề không hiện ở kho đề công khai. */
export function isClassOnly(targetType: unknown, targetClassIds: unknown): boolean {
  // Đề cũ để "classes" mà không chọn lớp nào thì trước đây vẫn công khai; giữ nguyên.
  return normalizeTargetType(targetType) === "classes" && Array.isArray(targetClassIds) && targetClassIds.length > 0;
}

export function sanitizeTargetClassIds(targetType: unknown, value: unknown): string[] {
  if (!assignsClasses(targetType) || !Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 160).slice(0, 100);
}
