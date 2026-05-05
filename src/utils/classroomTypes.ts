/**
 * classroomTypes.ts — Type definitions for the Classroom module.
 * These EXTEND the existing schema in examTypes.ts — do not modify that file.
 */

import type { Timestamp } from "firebase/firestore";

// ── Classroom ─────────────────────────────────────────────────────────────────

/** Firestore: `classes/{classId}` */
export interface ClassDoc {
  classCode: string;       // 6 chars — uppercase A-Z (no O/I) + digits 2-9
  name: string;
  description?: string;
  teacherId: string;
  teacherName: string;
  groupId?: string;
  studentIds: string[];
  maxStudents?: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Firestore: `class_groups/{groupId}` */
export interface ClassGroupDoc {
  name: string;
  description?: string;
  ownerId: string;
  classIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Firestore: `class_members/{classId_studentId}` */
export interface ClassMemberDoc {
  classId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  joinedAt: Timestamp;
  status: "active" | "suspended";
}

/** Extra fields merged into `users/{uid}` for MOD/Teacher role. */
export interface ModUserExtension {
  phoneNumber?: string;
  /** Lowercase diacritic-stripped tokens for array-contains search. */
  searchKeywords: string[];
}

// ── Anti-cheat exam/submission extensions (kept here to avoid modifying examTypes.ts) ─────

export type ReviewPolicy = "immediate" | "after_end" | "never";

export interface ExamDocExtension {
  classIds: string[];
  isShuffleQuestions: boolean;
  isShuffleOptions: boolean;
  reviewPolicy: ReviewPolicy;
}

export type ActivityAction =
  | "EXAM_START" | "EXAM_SUBMIT"
  | "TAB_BLUR" | "TAB_FOCUS"
  | "WINDOW_BLUR" | "WINDOW_FOCUS"
  | "ANSWER_CHANGED" | "COPY_ATTEMPT" | "PASTE_ATTEMPT";

export interface ActivityLogEntry {
  timestamp: number;
  action: ActivityAction;
  questionId?: number;
  detail?: string;
}

export interface SubmissionDocExtension {
  examStartTime: Timestamp;
  examStatus: "in_progress" | "submitted" | "timeout";
  actualTimeSpent: number;
  activityLogs: ActivityLogEntry[];
  shuffleSeed?: number;
  questionOrder?: number[];
  optionOrders?: Record<number, number[]>;
}

export interface AntiCheatSubmitPayload {
  activityLogs: ActivityLogEntry[];
  actualTimeSpent: number;
  examStartTime: number;
  shuffleSeed?: number;
  questionOrder?: number[];
  optionOrders?: Record<number, number[]>;
}
