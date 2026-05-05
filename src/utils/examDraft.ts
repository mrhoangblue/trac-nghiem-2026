/**
 * examDraft.ts — localStorage utilities for persisting in-progress exam answers.
 *
 * Key format: `draft_exam_{examId}_{studentUid}`
 * Draft is cleared ONLY on successful submission — never on reload.
 *
 * CRITICAL: These functions store/restore only p1Ans / p2Ans / p3Ans.
 * They do NOT touch scores, correctAnswer, or any grading data.
 */

export interface AnswerDraft {
  p1Ans: Record<number, number>;
  p2Ans: Record<number, (boolean | null)[]>;
  p3Ans: Record<number, string>;
  savedAt: number; // Date.now() — used to detect stale drafts
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // discard drafts older than 24 h

export function draftKey(examId: string, uid: string): string {
  return `draft_exam_${examId}_${uid}`;
}

export function saveDraft(
  examId: string,
  uid: string,
  answers: Omit<AnswerDraft, "savedAt">
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: AnswerDraft = { ...answers, savedAt: Date.now() };
    localStorage.setItem(draftKey(examId, uid), JSON.stringify(payload));
  } catch {
    // Private/incognito mode, quota exceeded — silently skip
  }
}

export function loadDraft(examId: string, uid: string): AnswerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(examId, uid));
    if (!raw) return null;
    const draft = JSON.parse(raw) as AnswerDraft;
    // Discard if older than TTL (e.g. student returns days later)
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey(examId, uid));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(examId: string, uid: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(draftKey(examId, uid));
  } catch {
    // ignore
  }
}
