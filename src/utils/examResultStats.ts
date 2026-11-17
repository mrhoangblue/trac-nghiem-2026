/**
 * Thống kê kết quả một đề cho trang giáo viên: tỉ lệ đúng từng câu, điểm trung
 * bình từng phần, so sánh lớp, học sinh chưa nộp, sắp xếp bảng.
 * Hàm thuần, không đụng tới Firestore, để kiểm thử được.
 */

export interface ResultStudent {
  /** Khoá duy nhất của học sinh trong bảng (email, hoặc id bài nộp khi thiếu email). */
  key: string;
  name: string;
  email: string;
  studentId?: string | null;
  total: number;
  p1: number;
  p2: number;
  p3: number;
  part1Results: boolean[];
  part2Results: number[];
  part3Results: boolean[];
  /** Phương án đã chọn ở từng câu Phần I (0 = A); null là bỏ trống. Vắng khi đề trộn mã. */
  p1Choices?: Array<number | null> | null;
  /** Tự luận chưa chấm: điểm tổng mới là tạm tính. */
  pending?: boolean;
  attempts?: number;
  latestMillis?: number;
  elapsedSeconds?: number;
  cheatCount?: number;
}

export interface ClassRoster {
  id: string;
  name: string;
  students: Array<{ uid: string; name: string; email: string }>;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const lower = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

// ── Câu hỏi ───────────────────────────────────────────────────────────────────

export interface QuestionStat {
  /** Số thứ tự câu trong đề (từ 1). */
  number: number;
  part: "P1" | "P2" | "P3";
  /** Số học sinh làm đúng hoàn toàn câu này. */
  correct: number;
  total: number;
  /** Tỉ lệ đúng 0..1. */
  rate: number;
  /** Phần I: số học sinh chọn từng phương án; vắng khi không có dữ liệu lựa chọn. */
  choices?: number[];
  blank?: number;
  /** Phần I: phương án sai được chọn nhiều nhất. */
  topWrong?: { option: number; count: number } | null;
  /** Phần II: số ý đúng trung bình (0..4). */
  averageMatches?: number;
}

export function questionStats(
  students: ResultStudent[],
  counts: { p1: number; p2: number; p3: number },
  p1Correct: Array<number | null> = [],
  optionCount = 4,
): QuestionStat[] {
  const total = students.length;
  const stats: QuestionStat[] = [];
  const rate = (correct: number) => (total > 0 ? correct / total : 0);

  for (let index = 0; index < counts.p1; index++) {
    const correct = students.filter((student) => student.part1Results[index] === true).length;
    const stat: QuestionStat = { number: index + 1, part: "P1", correct, total, rate: rate(correct) };
    const withChoices = students.filter((student) => Array.isArray(student.p1Choices));
    const answer = p1Correct[index];
    if (withChoices.length > 0 && typeof answer === "number") {
      const choices = Array.from({ length: optionCount }, () => 0);
      let blank = 0;
      for (const student of withChoices) {
        const choice = student.p1Choices![index];
        if (typeof choice === "number" && choice >= 0 && choice < optionCount) choices[choice]++;
        else blank++;
      }
      let topWrong: QuestionStat["topWrong"] = null;
      choices.forEach((count, option) => {
        if (option !== answer && count > 0 && (!topWrong || count > topWrong.count)) topWrong = { option, count };
      });
      Object.assign(stat, { choices, blank, topWrong });
    }
    stats.push(stat);
  }
  for (let index = 0; index < counts.p2; index++) {
    const matches = students.map((student) => Number(student.part2Results[index] ?? 0));
    const correct = matches.filter((value) => value >= 4).length;
    stats.push({
      number: counts.p1 + index + 1, part: "P2", correct, total, rate: rate(correct),
      averageMatches: total > 0 ? round2(matches.reduce((sum, value) => sum + value, 0) / total) : 0,
    });
  }
  for (let index = 0; index < counts.p3; index++) {
    const correct = students.filter((student) => student.part3Results[index] === true).length;
    stats.push({ number: counts.p1 + counts.p2 + index + 1, part: "P3", correct, total, rate: rate(correct) });
  }
  return stats;
}

// ── Điểm ──────────────────────────────────────────────────────────────────────

export interface ScoreSummary {
  count: number;
  average: number;
  p1: number;
  p2: number;
  p3: number;
  highest: number;
  lowest: number;
  median: number;
  /** Số học sinh từ 8 điểm, từ 5 đến dưới 8, dưới 5. */
  high: number;
  mid: number;
  low: number;
  /** Tỉ lệ từ 5 điểm trở lên, 0..1. */
  passRate: number;
}

export function scoreSummary(students: ResultStudent[]): ScoreSummary {
  const count = students.length;
  if (count === 0) return { count: 0, average: 0, p1: 0, p2: 0, p3: 0, highest: 0, lowest: 0, median: 0, high: 0, mid: 0, low: 0, passRate: 0 };
  const mean = (pick: (student: ResultStudent) => number) => round2(students.reduce((sum, student) => sum + pick(student), 0) / count);
  const totals = students.map((student) => student.total).sort((a, b) => a - b);
  const middle = Math.floor(count / 2);
  const high = totals.filter((value) => value >= 8).length;
  const low = totals.filter((value) => value < 5).length;
  return {
    count,
    average: mean((student) => student.total),
    p1: mean((student) => student.p1),
    p2: mean((student) => student.p2),
    p3: mean((student) => student.p3),
    highest: totals[count - 1],
    lowest: totals[0],
    median: round2(count % 2 ? totals[middle] : (totals[middle - 1] + totals[middle]) / 2),
    high,
    mid: count - high - low,
    low,
    passRate: (count - low) / count,
  };
}

// ── Lớp ───────────────────────────────────────────────────────────────────────

/** Học sinh thuộc những lớp nào (theo uid, không có uid thì theo email). */
export function classIdsOf(student: Pick<ResultStudent, "studentId" | "email">, classes: ClassRoster[]): string[] {
  const email = lower(student.email);
  return classes
    .filter((item) => item.students.some((member) => (student.studentId && member.uid === student.studentId) || (email && lower(member.email) === email)))
    .map((item) => item.id);
}

export interface ClassBreakdown {
  id: string;
  name: string;
  rosterSize: number;
  submitted: number;
  missing: Array<{ uid: string; name: string; email: string }>;
  summary: ScoreSummary;
}

export function classBreakdown(students: ResultStudent[], classes: ClassRoster[]): ClassBreakdown[] {
  return classes.map((item) => {
    const mine = students.filter((student) => classIdsOf(student, [item]).length > 0);
    const submittedIds = new Set(mine.map((student) => student.studentId).filter(Boolean));
    const submittedEmails = new Set(mine.map((student) => lower(student.email)).filter(Boolean));
    const missing = item.students
      .filter((member) => !submittedIds.has(member.uid) && !submittedEmails.has(lower(member.email)))
      .sort((a, b) => compareVietnameseNames(a.name, b.name));
    return { id: item.id, name: item.name, rosterSize: item.students.length, submitted: item.students.length - missing.length, missing, summary: scoreSummary(mine) };
  });
}

// ── Sắp xếp, tìm kiếm ─────────────────────────────────────────────────────────

/** So tên tiếng Việt theo tên gọi (từ cuối) trước, rồi tới họ và đệm. */
export function compareVietnameseNames(a: string, b: string): number {
  const split = (name: string) => {
    const words = name.trim().split(/\s+/);
    return { given: words[words.length - 1] ?? "", rest: words.slice(0, -1).join(" ") };
  };
  const left = split(a);
  const right = split(b);
  return left.given.localeCompare(right.given, "vi", { sensitivity: "base" }) || left.rest.localeCompare(right.rest, "vi", { sensitivity: "base" });
}

export type SortKey = "name" | "total" | "p1" | "p2" | "p3" | "attempts" | "latest" | "elapsed" | "cheat";

export function sortStudents<T extends ResultStudent>(students: T[], key: SortKey, direction: "asc" | "desc"): T[] {
  const value = (student: T): number => {
    switch (key) {
      case "total": return student.total;
      case "p1": return student.p1;
      case "p2": return student.p2;
      case "p3": return student.p3;
      case "attempts": return student.attempts ?? 0;
      case "latest": return student.latestMillis ?? 0;
      case "elapsed": return student.elapsedSeconds ?? 0;
      case "cheat": return student.cheatCount ?? 0;
      default: return 0;
    }
  };
  const sign = direction === "asc" ? 1 : -1;
  return [...students].sort((a, b) => {
    const primary = key === "name" ? compareVietnameseNames(a.name, b.name) : value(a) - value(b);
    return primary !== 0 ? primary * sign : compareVietnameseNames(a.name, b.name);
  });
}

/** Bỏ dấu, viết thường: tìm "hoang" ra "Hoàng". */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export function matchesSearch(student: Pick<ResultStudent, "name" | "email">, search: string): boolean {
  const needle = foldText(search.trim());
  return !needle || foldText(student.name).includes(needle) || foldText(student.email).includes(needle);
}
