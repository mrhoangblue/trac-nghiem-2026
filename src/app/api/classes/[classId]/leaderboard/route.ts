import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAuth } from "@/lib/verifyAuth";
import type { ClassLeaderboardStudent, ClassLeaderboardView } from "@/utils/classroomTypes";

export const runtime = "nodejs";

interface StudentAggregate {
  studentId: string;
  fullName: string;
  avatarUrl: string;
  completedExamIds: Set<string>;
  bestScoreByExam: Map<string, number>;
  totalExamSeconds: number;
  attemptCount: number;
}

const MAX_ATTEMPT_SECONDS = 7 * 24 * 60 * 60;

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  const timestampLike = value as { toMillis?: () => number } | null;
  if (typeof timestampLike?.toMillis === "function") return timestampLike.toMillis();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function attemptSeconds(submission: FirebaseFirestore.DocumentData): number {
  const stored = finiteNumber(submission.totalElapsedSeconds)
    ?? finiteNumber(submission.actualTimeSpent);
  if (stored !== null) {
    return Math.min(MAX_ATTEMPT_SECONDS, Math.max(0, Math.trunc(stored)));
  }

  const startedAt = timestampMillis(submission.examStartTime);
  const submittedAt = timestampMillis(submission.submittedAt);
  if (startedAt === null || submittedAt === null || submittedAt < startedAt) return 0;
  return Math.min(MAX_ATTEMPT_SECONDS, Math.max(0, Math.trunc((submittedAt - startedAt) / 1000)));
}

function submissionScore(submission: FirebaseFirestore.DocumentData): number | null {
  const stored = finiteNumber(submission.scores?.total);
  if (stored !== null) return Math.min(10, Math.max(0, stored));

  const p1 = finiteNumber(submission.scores?.p1);
  const p2 = finiteNumber(submission.scores?.p2);
  const p3 = finiteNumber(submission.scores?.p3);
  if (p1 === null && p2 === null && p3 === null) return null;
  return Math.min(10, Math.max(0, (p1 ?? 0) + (p2 ?? 0) + (p3 ?? 0)));
}

function studentView(student: StudentAggregate): ClassLeaderboardStudent {
  const bestScores = [...student.bestScoreByExam.values()];
  const average = bestScores.length
    ? bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length
    : 0;
  return {
    studentId: student.studentId,
    fullName: student.fullName,
    avatarUrl: student.avatarUrl,
    completedExamCount: student.completedExamIds.size,
    bestScoreAverage: Math.round(average * 100) / 100,
    totalExamSeconds: student.totalExamSeconds,
    attemptCount: student.attemptCount,
  };
}

function byName(left: ClassLeaderboardStudent, right: ClassLeaderboardStudent): number {
  return left.fullName.localeCompare(right.fullName, "vi");
}

async function loadExamSubmissions(examIds: string[]): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const result: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let index = 0; index < examIds.length; index += 10) {
    const batch = examIds.slice(index, index + 10);
    const snapshots = await Promise.all(batch.map((examId) => adminDb
      .collection("submissions")
      .where("examId", "==", examId)
      .get()));
    snapshots.forEach((snapshot) => result.push(...snapshot.docs));
  }
  return result;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const authUser = await verifyAuth(request);
    if (!authUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const { classId } = await params;
    const classSnapshot = await adminDb.collection("classes").doc(classId).get();
    if (!classSnapshot.exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const classData = classSnapshot.data() ?? {};
    const studentIds = Array.isArray(classData.studentIds)
      ? [...new Set(classData.studentIds.filter((value): value is string => typeof value === "string" && value.length > 0))]
      : [];
    const isTeacher = classData.teacherId === authUser.uid || authUser.role === "admin";
    const isStudent = studentIds.includes(authUser.uid);
    if (!isTeacher && !isStudent) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const [targetExamSnapshot, legacyExamSnapshot, memberSnapshot] = await Promise.all([
      adminDb.collection("exams").where("targetClassIds", "array-contains", classId).get(),
      adminDb.collection("exams").where("classIds", "array-contains", classId).get(),
      adminDb.collection("class_members").where("classId", "==", classId).get(),
    ]);
    const examIds = [...new Set([
      ...targetExamSnapshot.docs.map((document) => document.id),
      ...legacyExamSnapshot.docs.map((document) => document.id),
    ])];

    const userSnapshots = studentIds.length
      ? await adminDb.getAll(...studentIds.map((studentId) => adminDb.collection("users").doc(studentId)))
      : [];
    const memberByStudentId = new Map(memberSnapshot.docs.map((document) => {
      const data = document.data();
      return [String(data.studentId ?? ""), data] as const;
    }));
    const aggregateByEmail = new Map<string, StudentAggregate>();
    const aggregateById = new Map<string, StudentAggregate>();

    userSnapshots.forEach((snapshot) => {
      const profile = snapshot.data() ?? {};
      const membership = memberByStudentId.get(snapshot.id) ?? {};
      const email = normalizedEmail(profile.email ?? membership.studentEmail);
      const aggregate: StudentAggregate = {
        studentId: snapshot.id,
        fullName: String(profile.fullName ?? membership.studentName ?? "Học sinh"),
        avatarUrl: String(profile.photoURL ?? profile.avatarUrl ?? ""),
        completedExamIds: new Set(),
        bestScoreByExam: new Map(),
        totalExamSeconds: 0,
        attemptCount: 0,
      };
      aggregateById.set(snapshot.id, aggregate);
      if (email) aggregateByEmail.set(email, aggregate);
    });

    const submissions = examIds.length ? await loadExamSubmissions(examIds) : [];
    submissions.forEach((document) => {
      const submission = document.data();
      if (submission.status !== "COMPLETED" || submission.isTeacherPreview === true) return;
      const examId = typeof submission.examId === "string" ? submission.examId : "";
      const student = aggregateByEmail.get(normalizedEmail(submission.studentEmail));
      if (!examId || !student) return;

      student.completedExamIds.add(examId);
      student.attemptCount += 1;
      student.totalExamSeconds += attemptSeconds(submission);
      if (!student.avatarUrl && typeof submission.studentAvatar === "string") {
        student.avatarUrl = submission.studentAvatar;
      }
      const score = submissionScore(submission);
      if (score !== null && score > (student.bestScoreByExam.get(examId) ?? -1)) {
        student.bestScoreByExam.set(examId, score);
      }
    });

    const students = [...aggregateById.values()].map(studentView);
    const activeStudents = students.filter((student) => student.completedExamCount > 0);
    const completion = [...activeStudents].sort((left, right) => (
      right.completedExamCount - left.completedExamCount
      || right.bestScoreAverage - left.bestScoreAverage
      || right.totalExamSeconds - left.totalExamSeconds
      || byName(left, right)
    ));
    const score = [...activeStudents].sort((left, right) => (
      right.bestScoreAverage - left.bestScoreAverage
      || right.completedExamCount - left.completedExamCount
      || byName(left, right)
    ));
    const studyTime = [...activeStudents].sort((left, right) => (
      right.totalExamSeconds - left.totalExamSeconds
      || right.completedExamCount - left.completedExamCount
      || byName(left, right)
    ));

    const response: ClassLeaderboardView = {
      assignedExamCount: examIds.length,
      studentCount: studentIds.length,
      viewerStudentId: isStudent ? authUser.uid : null,
      completion,
      score,
      studyTime,
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET class leaderboard failed:", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
