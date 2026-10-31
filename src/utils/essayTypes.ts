/**
 * Kiểu dữ liệu bài tự luận dùng chung cho trình duyệt và API. Tọa độ nét chấm
 * lưu theo tỉ lệ 0–1 của trang nên phóng to/thu nhỏ vẫn đúng vị trí.
 */
export type EssayFileKind = "image" | "pdf";

export interface EssayFile {
  key: string;
  kind: EssayFileKind;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  name?: string;
}

/** File kèm link xem tạm thời do API ký. */
export interface EssayFileView extends EssayFile {
  url: string;
}

export type EssayStampKind = "check" | "cross" | "plus025" | "plus05" | "half";

export const ESSAY_STAMPS: Record<EssayStampKind, { label: string; points: number }> = {
  check: { label: "✓", points: 0 },
  cross: { label: "✗", points: 0 },
  plus025: { label: "+0,25", points: 0.25 },
  plus05: { label: "+0,5", points: 0.5 },
  half: { label: "½", points: 0 },
};

export type EssayMark =
  | { id: string; kind: "pen"; color: string; size: number; points: Array<[number, number, number]> }
  | { id: string; kind: "highlighter"; color: string; size: number; points: Array<[number, number, number]> }
  | { id: string; kind: "text"; x: number; y: number; text: string; color: string; size: number }
  | { id: string; kind: "stamp"; x: number; y: number; stamp: EssayStampKind; color: string };

/** Nét chấm theo trang. Khóa trang: `${fileKey}#${pageIndex}`. */
export type EssayAnnotations = Record<string, EssayMark[]>;

export function pageKey(fileKey: string, pageIndex: number): string {
  return `${fileKey}#${pageIndex}`;
}

export interface EssayGrading {
  /** Điểm từng câu tự luận, khóa là id câu hỏi. */
  essayScores: Record<string, number>;
  essayComments: Record<string, string>;
  generalComment: string;
  gradedBy?: string;
  gradedAt?: number | null;
}

/** Trạng thái giai đoạn nộp ảnh mà API trả về. */
export interface EssayUploadState {
  submissionId: string;
  files: EssayFileView[];
  /** null khi đang làm bài (chưa nộp Phần I–III). */
  uploadDeadlineMillis: number | null;
  uploadOpen: boolean;
  finalized: boolean;
  gradingStatus: "pending" | "graded" | null;
}
