/**
 * useExamShuffle — Deterministic per-student question & option shuffler.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  CRITICAL: Zero changes to grading logic required.                     │
 * │                                                                         │
 * │  Strategy (mirrors LaTeX `ex_test` package):                           │
 * │  1. A random seed is generated once at exam-start time.                 │
 * │  2. A seeded PRNG (Mulberry32) drives a Fisher-Yates shuffle.           │
 * │  3. Questions are DISPLAYED in shuffled order — but each question      │
 * │     retains its original `id` throughout. Grading reads `p1Ans[q.id]` │
 * │     which is always the ORIGINAL option index, so grading is safe.     │
 * │  4. When P1 options are shuffled, the stored answer is mapped back to  │
 * │     the original option index by mapToOriginalOption() before being    │
 * │     put into p1Ans. QuizClient's `p1Ans[q.id] === q.correctAnswer`    │
 * │     comparison still works without any change.                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { useMemo } from "react";
import type { ParsedQuestion } from "@/utils/latexParser";

// ─────────────────────────────────────────────────────────────────────────────
// Seeded PRNG — Mulberry32
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a pseudo-random number generator seeded with `seed`.
 * Mulberry32 is fast, has excellent statistical properties for this use case,
 * and is reproducible: same seed → same shuffle every time.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0; // ensure unsigned 32-bit
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fisher-Yates shuffle (returns a permutation of [0, 1, …, length-1])
// ─────────────────────────────────────────────────────────────────────────────

function shuffleIndexes(length: number, rng: () => number): number[] {
  const idx = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShuffleConfig {
  isShuffleQuestions: boolean;
  isShuffleOptions: boolean; // only applies to P1 (multiple_choice) questions
  seed: number;
}

export interface ShuffleResult {
  /**
   * Questions in the order they should be DISPLAYED.
   * Each question's `id` is unchanged — grading still works correctly.
   *
   * For P1 questions with shuffled options, `options` is reordered for display.
   * The `correctAnswer` field is NOT updated — it still holds the ORIGINAL index.
   * Use mapToOriginalOption() when storing the student's selection.
   */
  displayQuestions: ParsedQuestion[];

  /**
   * For each P1 question: displayOptionIndex → originalOptionIndex mapping.
   *
   * Example: optionOrders[5] = [2, 0, 3, 1] means:
   *   displayed option 0 = original option C (index 2)
   *   displayed option 1 = original option A (index 0)
   *
   * When the student selects displayed index k, store:
   *   p1Ans[questionId] = optionOrders[questionId][k]   ← original index
   * Then grading's `p1Ans[q.id] === q.correctAnswer` works unchanged.
   *
   * Empty object when isShuffleOptions is false.
   */
  optionOrders: Record<number, number[]>;

  /** Original question IDs in display order — stored for moderator audit. */
  questionOrder: number[];

  /** The seed used — store with the submission for reproducibility. */
  seed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// useExamShuffle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memoized hook — recalculates only when `questions` array reference or
 * `config` values change (which should only happen once, at exam start).
 */
export function useExamShuffle(
  questions: ParsedQuestion[],
  config: ShuffleConfig
): ShuffleResult {
  return useMemo(() => {
    const { isShuffleQuestions, isShuffleOptions, seed } = config;

    // Fast path: no shuffle configured
    if (!isShuffleQuestions && !isShuffleOptions) {
      return {
        displayQuestions: questions,
        optionOrders: {},
        questionOrder: questions.map((q) => q.id),
        seed,
      };
    }

    // Each shuffle phase gets its own independent sequence from the same seed
    // by advancing the PRNG state separately for questions vs options.
    const rngQuestions = mulberry32(seed);
    const rngOptions = mulberry32(seed ^ 0xdeadbeef); // XOR ensures independence

    // ── Phase 1: shuffle question order ────────────────────────────────────
    let displayQuestions: ParsedQuestion[];
    if (isShuffleQuestions) {
      const permutation = shuffleIndexes(questions.length, rngQuestions);
      displayQuestions = permutation.map((i) => questions[i]);
    } else {
      displayQuestions = [...questions];
    }

    // ── Phase 2: shuffle P1 options ────────────────────────────────────────
    const optionOrders: Record<number, number[]> = {};
    const finalQuestions = displayQuestions.map((q) => {
      if (!isShuffleOptions || q.type !== "multiple_choice" || !q.options) {
        return q;
      }
      const order = shuffleIndexes(q.options.length, rngOptions);
      optionOrders[q.id] = order; // store for answer remapping

      return {
        ...q,
        // Reorder the displayed options array — correctAnswer index is NOT changed
        options: order.map((origIdx) => q.options![origIdx]),
      };
    });

    return {
      displayQuestions: finalQuestions,
      optionOrders,
      questionOrder: displayQuestions.map((q) => q.id),
      seed,
    };
  }, [questions, config]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: generate a fresh random seed
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a random seed for a new exam session. */
export function generateShuffleSeed(): number {
  return (Math.random() * 0x7fffffff) >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: remap displayed selection → original option index
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a student's displayed-option selection to the original option index.
 *
 * Use this as a drop-in wrapper around setP1Ans calls when options are shuffled:
 *
 *   // Before (no shuffle):
 *   setP1Ans(prev => ({ ...prev, [q.id]: displayedOptionIndex }));
 *
 *   // After (with shuffle):
 *   const originalIdx = mapToOriginalOption(optionOrders, q.id, displayedOptionIndex);
 *   setP1Ans(prev => ({ ...prev, [q.id]: originalIdx }));
 *
 * When `optionOrders[questionId]` is undefined (no shuffle or P2/P3 question),
 * the function returns `displayOptionIndex` unchanged — safe to call always.
 */
export function mapToOriginalOption(
  optionOrders: Record<number, number[]>,
  questionId: number,
  displayOptionIndex: number
): number {
  const order = optionOrders[questionId];
  if (!order) return displayOptionIndex;
  return order[displayOptionIndex] ?? displayOptionIndex;
}
