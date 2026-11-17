/**
 * Tổng quan cho giáo viên: tiến bộ của từng học sinh qua các đề và danh sách
 * học sinh cần chú ý. Hàm thuần để kiểm thử được.
 */

export interface ScorePoint {
  examId: string;
  title: string;
  /** Điểm cao nhất của học sinh ở đề này, thang 10. */
  total: number;
  /** Thời điểm nộp lượt điểm cao nhất. */
  millis: number;
}

export interface StudentProgress {
  key: string;
  studentId: string | null;
  name: string;
  email: string;
  /** Các đề đã có điểm, cũ trước mới sau. */
  scores: ScorePoint[];
  /** Số đề được giao qua lớp và số đề trong đó chưa nộp. */
  assigned: number;
  missed: number;
  classNames: string[];
}

export type AttentionReason = "dropping" | "low" | "missing";

export interface AttentionItem extends StudentProgress {
  reasons: AttentionReason[];
  /** Trung bình tối đa 3 đề gần nhất; null khi chưa có điểm. */
  recentAverage: number | null;
  /** Mức giảm của đề gần nhất so với trung bình các đề trước đó. */
  drop: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export const ATTENTION_RULES = {
  /** Giảm từ chừng này điểm so với trung bình (tối đa) 3 đề liền trước. */
  dropPoints: 1.5,
  /** Trung bình các đề gần nhất dưới mức này là điểm thấp. */
  lowAverage: 5,
  /** Bỏ từ chừng này đề được giao, và ít nhất một nửa số đề được giao. */
  missedExams: 2,
  missedShare: 0.5,
};

export function attentionOf(student: StudentProgress): AttentionItem {
  const totals = student.scores.map((point) => point.total);
  const recent = totals.slice(-3);
  const recentAverage = recent.length ? round2(mean(recent)) : null;
  const previous = totals.slice(-4, -1);
  const drop = totals.length >= 3 ? round2(mean(previous) - totals[totals.length - 1]) : 0;
  const reasons: AttentionReason[] = [];
  if (drop >= ATTENTION_RULES.dropPoints) reasons.push("dropping");
  if (totals.length >= 2 && recentAverage !== null && recentAverage < ATTENTION_RULES.lowAverage) reasons.push("low");
  if (student.missed >= ATTENTION_RULES.missedExams && student.missed / student.assigned >= ATTENTION_RULES.missedShare) reasons.push("missing");
  return { ...student, reasons, recentAverage, drop };
}

/** Học sinh có ít nhất một dấu hiệu, nặng trước nhẹ sau. */
export function attentionList(students: StudentProgress[]): AttentionItem[] {
  return students
    .map(attentionOf)
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length
      || b.missed - a.missed
      || (a.recentAverage ?? 10) - (b.recentAverage ?? 10)
      || a.name.localeCompare(b.name, "vi"));
}

export interface AttemptRecord {
  examId: string;
  studentId: string | null;
  email: string;
  name: string;
  total: number;
  millis: number;
}

/**
 * Gom các lượt nộp đã có điểm thành tiến trình từng học sinh: mỗi đề lấy lượt
 * điểm cao nhất, xếp các đề theo thời điểm nộp.
 */
export function buildProgress(
  attempts: AttemptRecord[],
  examTitles: Map<string, string>,
  classes: Array<{ name: string; examIds: string[]; students: Array<{ uid: string; name: string; email: string }> }>,
): StudentProgress[] {
  const lower = (value: string) => value.trim().toLowerCase();
  const byStudent = new Map<string, { studentId: string | null; name: string; email: string; best: Map<string, ScorePoint> }>();
  const keyOf = (studentId: string | null, email: string) => lower(email) || studentId || "";
  for (const attempt of attempts) {
    const key = keyOf(attempt.studentId, attempt.email);
    if (!key) continue;
    const entry = byStudent.get(key) ?? { studentId: attempt.studentId, name: attempt.name, email: attempt.email, best: new Map<string, ScorePoint>() };
    if (!entry.studentId && attempt.studentId) entry.studentId = attempt.studentId;
    const current = entry.best.get(attempt.examId);
    if (!current || attempt.total > current.total) {
      entry.best.set(attempt.examId, { examId: attempt.examId, title: examTitles.get(attempt.examId) ?? "Bài thi", total: attempt.total, millis: attempt.millis });
    }
    byStudent.set(key, entry);
  }
  // Học sinh trong lớp chưa nộp đề nào vẫn phải có mặt để đếm số đề bỏ.
  for (const item of classes) {
    for (const member of item.students) {
      const key = keyOf(member.uid, member.email);
      if (!key) continue;
      const existing = byStudent.get(key);
      // Bài nộp thường chỉ có email; mã học sinh lấy từ danh sách lớp để mở được trang học sinh.
      if (existing) { if (!existing.studentId) existing.studentId = member.uid; }
      else byStudent.set(key, { studentId: member.uid, name: member.name, email: member.email, best: new Map() });
    }
  }
  return Array.from(byStudent.entries()).map(([key, entry]) => {
    const mine = classes.filter((item) => item.students.some((member) => (entry.studentId && member.uid === entry.studentId) || (member.email && lower(member.email) === lower(entry.email))));
    const assignedIds = new Set(mine.flatMap((item) => item.examIds));
    const missed = Array.from(assignedIds).filter((examId) => !entry.best.has(examId)).length;
    return {
      key,
      studentId: entry.studentId,
      name: entry.name,
      email: entry.email,
      scores: Array.from(entry.best.values()).sort((a, b) => a.millis - b.millis),
      assigned: assignedIds.size,
      missed,
      classNames: mine.map((item) => item.name),
    };
  });
}
