export interface ScoringConfig {
  part1TotalScore: number;
  part3TotalScore: number;
}

export interface TimingConfig {
  duration: number;       // phút
  startTime: string | null; // "YYYY-MM-DDTHH:MM" (datetime-local), null = không giới hạn
  endTime: string | null;
}

export interface ScoreResult {
  p1: number;
  p2: number;
  p3: number;
  total: number;
  part1: { correct: number; total: number; score: number };
  part2: { details: Array<{ match: number; maxMatch: number; score: number }>; totalScore: number };
  part3: { correct: number; total: number; score: number };
}

// Bảng điểm P2 cố định theo số ý đúng
export const P2_TABLE = [0, 0.1, 0.25, 0.5, 1.0];

export function normalizeAnswer(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\$/g, "")
    .replace(/[{}]/g, "")
    .replace(/−/g, "-")   // unicode minus → ASCII minus
    .replace(/,/g, ".");
}

/** Định dạng giây → MM:SS hoặc HH:MM:SS */
export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Format Firestore Timestamp hoặc chuỗi ISO thành ngày giờ dễ đọc (vi-VN) */
export function formatDateTime(value: unknown): string {
  if (!value) return "—";
  let d: Date;
  // Firestore Timestamp object
  if (value && typeof (value as any).toDate === "function") {
    d = (value as any).toDate();
  } else {
    d = new Date(value as string);
  }
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
