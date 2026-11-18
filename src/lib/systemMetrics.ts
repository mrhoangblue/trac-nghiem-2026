import "server-only";
/**
 * Số liệu toàn hệ thống cho khu quản trị. Đọc các collection chính với trường tối thiểu, giữ bản chụp 60 giây
 * trong bộ nhớ để nhiều trang quản trị mở liền nhau không đọc lại Firestore. Bài làm thử của giáo viên
 * (isTeacherPreview) không tính vào số liệu học sinh.
 */
import { adminDb } from "@/lib/firebaseAdmin";
import { millis, vnDay } from "@/lib/systemAdmin";

const DAY = 86_400_000;

export interface PUser { uid: string; email: string; fullName: string; school: string; role: string; disabled: boolean; createdAt: number | null }
export interface PExam { id: string; title: string; author: string; gradeLevel: string; examType: string; createdAt: number | null; classOnly: boolean; hidden: boolean; requiresPassword: boolean; duration: number; questionCount: number }
export interface PSub { id: string; examId: string; examTitle: string; email: string; at: number; total: number | null; pending: boolean; cheat: number; idle: number; elapsed: number; preview: boolean }
export interface PClass { id: string; name: string; code: string; teacherId: string; teacherName: string; active: boolean; createdAt: number | null; studentCount: number }
export interface PMember { classId: string; studentId: string; status: string; at: number | null }
export interface PTimed { classId: string; teacherId: string; at: number | null; extra: number }
export interface PReset { examTitle: string; studentEmail: string; deleted: number; by: string; at: number | null }
export interface Platform {
  now: number; users: PUser[]; exams: PExam[]; subs: PSub[]; classes: PClass[]; members: PMember[];
  assignments: PTimed[]; courses: PTimed[]; announcements: PTimed[]; resets: PReset[];
}

let cache: { at: number; value: Platform } | null = null;

export async function loadPlatform(): Promise<Platform> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const db = adminDb;
  const [users, exams, subs, classes, members, assignments, courses, announcements, resets] = await Promise.all([
    db.collection("users").select("email", "fullName", "school", "role", "disabled", "createdAt").get(),
    db.collection("exams").select("title", "authorEmail", "gradeLevel", "examType", "createdAt", "targetType", "moderation", "requiresPassword", "duration", "questionCount").get(),
    db.collection("submissions").select("examId", "examTitle", "studentEmail", "submittedAt", "scores", "gradingStatus", "cheatCount", "idleBeforeSubmitSeconds", "totalElapsedSeconds", "isTeacherPreview", "status").get(),
    db.collection("classes").select("name", "classCode", "teacherId", "teacherName", "studentIds", "isActive", "createdAt").get(),
    db.collection("class_members").select("classId", "studentId", "status", "joinedAt", "requestedAt").get(),
    db.collection("class_assignments").select("classId", "teacherId", "createdAt", "dueAt").get(),
    db.collection("class_courses").select("classId", "teacherId", "createdAt", "published").get(),
    db.collection("class_announcements").select("classId", "teacherId", "createdAt").get(),
    db.collection("submission_reset_audits").select("examTitle", "studentEmail", "deletedSubmissionCount", "resetByEmail", "resetAt").get(),
  ]);
  const value: Platform = {
    now: Date.now(),
    users: users.docs.map((d) => ({ uid: d.id, email: String(d.get("email") ?? "").toLowerCase(), fullName: String(d.get("fullName") ?? ""), school: String(d.get("school") ?? ""), role: String(d.get("role") ?? "student"), disabled: d.get("disabled") === true, createdAt: millis(d.get("createdAt")) })),
    exams: exams.docs.map((d) => ({ id: d.id, title: String(d.get("title") ?? "Bài thi"), author: String(d.get("authorEmail") ?? "").toLowerCase(), gradeLevel: String(d.get("gradeLevel") ?? "Khác"), examType: String(d.get("examType") ?? "Khác"), createdAt: millis(d.get("createdAt")), classOnly: d.get("targetType") === "classes", hidden: d.get("moderation")?.hidden === true, requiresPassword: d.get("requiresPassword") === true, duration: Number(d.get("duration") ?? 0), questionCount: Number(d.get("questionCount") ?? 0) })),
    subs: subs.docs.map((d) => {
      const total = d.get("scores")?.total;
      return { id: d.id, examId: String(d.get("examId") ?? ""), examTitle: String(d.get("examTitle") ?? ""), email: String(d.get("studentEmail") ?? "").toLowerCase(), at: millis(d.get("submittedAt")) ?? 0, total: typeof total === "number" ? total : null, pending: d.get("gradingStatus") === "pending", cheat: Number(d.get("cheatCount") ?? 0), idle: Number(d.get("idleBeforeSubmitSeconds") ?? 0), elapsed: Number(d.get("totalElapsedSeconds") ?? 0), preview: d.get("isTeacherPreview") === true };
    }).filter((s) => s.at > 0),
    classes: classes.docs.map((d) => ({ id: d.id, name: String(d.get("name") ?? ""), code: String(d.get("classCode") ?? ""), teacherId: String(d.get("teacherId") ?? ""), teacherName: String(d.get("teacherName") ?? ""), active: d.get("isActive") !== false, createdAt: millis(d.get("createdAt")), studentCount: Array.isArray(d.get("studentIds")) ? d.get("studentIds").length : 0 })),
    members: members.docs.map((d) => ({ classId: String(d.get("classId") ?? ""), studentId: String(d.get("studentId") ?? ""), status: String(d.get("status") ?? ""), at: millis(d.get("joinedAt")) ?? millis(d.get("requestedAt")) })),
    assignments: assignments.docs.map((d) => ({ classId: String(d.get("classId") ?? ""), teacherId: String(d.get("teacherId") ?? ""), at: millis(d.get("createdAt")), extra: millis(d.get("dueAt")) ?? 0 })),
    courses: courses.docs.map((d) => ({ classId: String(d.get("classId") ?? ""), teacherId: String(d.get("teacherId") ?? ""), at: millis(d.get("createdAt")), extra: d.get("published") === true ? 1 : 0 })),
    announcements: announcements.docs.map((d) => ({ classId: String(d.get("classId") ?? ""), teacherId: String(d.get("teacherId") ?? ""), at: millis(d.get("createdAt")), extra: 0 })),
    resets: resets.docs.map((d) => ({ examTitle: String(d.get("examTitle") ?? ""), studentEmail: String(d.get("studentEmail") ?? ""), deleted: Number(d.get("deletedSubmissionCount") ?? 0), by: String(d.get("resetByEmail") ?? ""), at: millis(d.get("resetAt")) })),
  };
  cache = { at: Date.now(), value };
  return value;
}

const avg = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null);
const vnHour = (ms: number) => new Date(ms + 7 * 3600_000).getUTCHours();
const vnWeekday = (ms: number) => (new Date(ms + 7 * 3600_000).getUTCDay() + 6) % 7; // 0 = thứ hai

export function buildOverview(p: Platform) {
  const { now } = p;
  const real = p.subs.filter((s) => !s.preview);
  const last = (days: number, from = 0) => real.filter((s) => now - s.at < (days + from) * DAY && now - s.at >= from * DAY);
  const days = Array.from({ length: 30 }, (_, i) => vnDay(now - (29 - i) * DAY));
  const series = new Map(days.map((day) => [day, { day, users: 0, submissions: 0, exams: 0, active: new Set<string>() }]));
  p.users.forEach((u) => { const bucket = u.createdAt ? series.get(vnDay(u.createdAt)) : undefined; if (bucket) bucket.users++; });
  p.exams.forEach((e) => { if (e.createdAt && series.has(vnDay(e.createdAt))) series.get(vnDay(e.createdAt))!.exams++; });
  real.forEach((s) => { const b = series.get(vnDay(s.at)); if (b) { b.submissions++; if (s.email) b.active.add(s.email); } });

  const roles = { student: 0, mod: 0, pending_teacher: 0, admin: 0 } as Record<string, number>;
  p.users.forEach((u) => { roles[u.role] = (roles[u.role] ?? 0) + 1; });
  const usersLast7 = p.users.filter((u) => u.createdAt && now - u.createdAt < 7 * DAY).length;
  const usersPrev7 = p.users.filter((u) => u.createdAt && now - u.createdAt >= 7 * DAY && now - u.createdAt < 14 * DAY).length;

  const active7 = new Set(last(7).map((s) => s.email).filter(Boolean));
  const active30 = new Set(last(30).map((s) => s.email).filter(Boolean));
  const scores30 = last(30).filter((s) => s.total !== null && !s.pending).map((s) => s.total as number);

  const authorByExam = new Map(p.exams.map((e) => [e.id, e.author]));
  const activeTeachers30 = new Set(last(30).map((s) => authorByExam.get(s.examId)).filter(Boolean));

  // Phễu giáo viên.
  const emailToUid = new Map(p.users.map((u) => [u.email, u.uid]));
  const teacherEmails = p.users.filter((u) => u.role === "mod" || u.role === "pending_teacher").map((u) => u.email);
  const approved = p.users.filter((u) => u.role === "mod").map((u) => u.email);
  const authors = new Set(p.exams.map((e) => e.author));
  const withAttempts = new Set(real.map((s) => authorByExam.get(s.examId)).filter(Boolean));
  const classTeachers = new Set(p.classes.map((c) => c.teacherId));
  const teacherFunnel = [
    { label: "Đăng ký giáo viên", value: teacherEmails.length },
    { label: "Được duyệt", value: approved.length },
    { label: "Đã tạo đề", value: approved.filter((e) => authors.has(e)).length },
    { label: "Có học sinh làm", value: approved.filter((e) => withAttempts.has(e)).length },
    { label: "Có lớp học", value: approved.filter((e) => classTeachers.has(emailToUid.get(e) ?? "")).length },
  ];

  // Phễu học sinh.
  const students = p.users.filter((u) => u.role === "student");
  const perStudent = new Map<string, number>();
  real.forEach((s) => { if (s.email) perStudent.set(s.email, (perStudent.get(s.email) ?? 0) + 1); });
  const inClass = new Set(p.members.filter((m) => m.status === "active").map((m) => m.studentId));
  const studentFunnel = [
    { label: "Đăng ký học sinh", value: students.length },
    { label: "Vào lớp", value: students.filter((u) => inClass.has(u.uid)).length },
    { label: "Làm bài đầu tiên", value: students.filter((u) => (perStudent.get(u.email) ?? 0) >= 1).length },
    { label: "Làm từ 3 bài", value: students.filter((u) => (perStudent.get(u.email) ?? 0) >= 3).length },
  ];

  // Giữ chân: nhóm học sinh theo tuần đăng ký (8 tuần gần nhất), tỉ lệ có nộp bài ở các tuần sau đó.
  const weekOf = (ms: number) => Math.floor((now - ms) / (7 * DAY));
  const subsByEmail = new Map<string, number[]>();
  real.forEach((s) => { if (s.email) (subsByEmail.get(s.email) ?? subsByEmail.set(s.email, []).get(s.email)!).push(s.at); });
  const cohorts = Array.from({ length: 8 }, (_, ago) => {
    const members = students.filter((u) => u.createdAt && weekOf(u.createdAt) === ago);
    const retained: Array<number | null> = Array.from({ length: 5 }, (_, offset) => {
      if (offset > ago) return null;
      if (members.length === 0) return null;
      const hit = members.filter((u) => (subsByEmail.get(u.email) ?? []).some((at) => weekOf(at) === ago - offset)).length;
      return Math.round((hit / members.length) * 100);
    });
    return { label: ago === 0 ? "Tuần này" : `${ago} tuần trước`, size: members.length, retained };
  }).reverse();

  // Phân bố.
  const byGrade = new Map<string, { label: string; exams: number; attempts: number }>();
  const examById = new Map(p.exams.map((e) => [e.id, e]));
  p.exams.forEach((e) => { const k = e.gradeLevel; const v = byGrade.get(k) ?? { label: k, exams: 0, attempts: 0 }; v.exams++; byGrade.set(k, v); });
  real.forEach((s) => { const e = examById.get(s.examId); if (e) byGrade.get(e.gradeLevel)!.attempts++; });
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: 0 }));
  const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => ({ label, value: 0 }));
  last(30).forEach((s) => { hours[vnHour(s.at)].value++; weekdays[vnWeekday(s.at)].value++; });

  // Xếp hạng.
  const attemptsByExam = new Map<string, { n: number; scores: number[] }>();
  last(30).forEach((s) => { const v = attemptsByExam.get(s.examId) ?? { n: 0, scores: [] }; v.n++; if (s.total !== null && !s.pending) v.scores.push(s.total); attemptsByExam.set(s.examId, v); });
  const topExams = [...attemptsByExam.entries()].map(([id, v]) => ({ id, title: examById.get(id)?.title ?? "(đề đã xóa)", attempts: v.n, avg: avg(v.scores) })).sort((a, b) => b.attempts - a.attempts).slice(0, 8);
  const byTeacher = new Map<string, number>();
  last(30).forEach((s) => { const a = authorByExam.get(s.examId); if (a) byTeacher.set(a, (byTeacher.get(a) ?? 0) + 1); });
  const nameByEmail = new Map(p.users.map((u) => [u.email, u.fullName || u.email]));
  const topTeachers = [...byTeacher.entries()].map(([email, n]) => ({ email, name: nameByEmail.get(email) ?? email, attempts: n })).sort((a, b) => b.attempts - a.attempts).slice(0, 8);

  // Việc cần xử lý.
  const pendingSubs = real.filter((s) => s.pending);
  const stale48 = pendingSubs.filter((s) => now - s.at > 2 * DAY);
  const pendingJoins = p.members.filter((m) => m.status === "pending").length;
  const pendingTeachers = p.users.filter((u) => u.role === "pending_teacher");
  const suspicious30 = last(30).filter((s) => s.cheat >= 3 || s.idle >= 300).length;
  const unusedExams = p.exams.filter((e) => e.createdAt && now - e.createdAt > 14 * DAY && !real.some((s) => s.examId === e.id)).length;

  return {
    totals: { users: p.users.length, students: roles.student ?? 0, teachers: roles.mod ?? 0, pendingTeachers: pendingTeachers.length, disabled: p.users.filter((u) => u.disabled).length, exams: p.exams.length, hiddenExams: p.exams.filter((e) => e.hidden).length, submissions: real.length, classes: p.classes.length, activeClasses: p.classes.filter((c) => c.active).length, classMembers: p.members.filter((m) => m.status === "active").length, assignments: p.assignments.length, courses: p.courses.length },
    activity: { active7: active7.size, active30: active30.size, activeTeachers30: activeTeachers30.size, usersLast7, usersPrev7, submissionsLast7: last(7).length, submissionsPrev7: last(7, 7).length, avgScore30: avg(scores30), announcements30: p.announcements.filter((a) => a.at && now - a.at < 30 * DAY).length },
    attention: { pendingTeachers: pendingTeachers.length, oldestPendingTeacherDays: pendingTeachers.length ? Math.floor((now - Math.min(...pendingTeachers.map((u) => u.createdAt ?? now))) / DAY) : 0, pendingJoins, pendingGrading: pendingSubs.length, staleGrading: stale48.length, suspicious30, unusedExams, hiddenExams: p.exams.filter((e) => e.hidden).length, disabled: p.users.filter((u) => u.disabled).length },
    series: [...series.values()].map((b) => ({ day: b.day, users: b.users, submissions: b.submissions, exams: b.exams, active: b.active.size })),
    teacherFunnel, studentFunnel, cohorts,
    byGrade: [...byGrade.values()].sort((a, b) => b.attempts - a.attempts), hours, weekdays, topExams, topTeachers,
  };
}

export function buildTeachers(p: Platform) {
  const { now } = p;
  const real = p.subs.filter((s) => !s.preview);
  const examsBy = new Map<string, PExam[]>();
  p.exams.forEach((e) => (examsBy.get(e.author) ?? examsBy.set(e.author, []).get(e.author)!).push(e));
  const authorByExam = new Map(p.exams.map((e) => [e.id, e.author]));
  const subsBy = new Map<string, PSub[]>();
  real.forEach((s) => { const a = authorByExam.get(s.examId); if (a) (subsBy.get(a) ?? subsBy.set(a, []).get(a)!).push(s); });
  return p.users.filter((u) => u.role === "mod" || u.role === "pending_teacher").map((u) => {
    const exams = examsBy.get(u.email) ?? [];
    const subs = subsBy.get(u.email) ?? [];
    const classes = p.classes.filter((c) => c.teacherId === u.uid);
    const classIds = new Set(classes.map((c) => c.id));
    const students = new Set(p.members.filter((m) => classIds.has(m.classId) && m.status === "active").map((m) => m.studentId));
    const stamps = [
      ...exams.map((e) => e.createdAt ?? 0), ...subs.map((s) => s.at),
      ...[...p.assignments, ...p.announcements, ...p.courses].filter((x) => x.teacherId === u.uid).map((x) => x.at ?? 0),
    ];
    const lastActivity = stamps.length ? Math.max(...stamps) : null;
    const status = u.role === "pending_teacher" ? "pending" : exams.length === 0 && classes.length === 0 ? "new" : lastActivity && now - lastActivity < 30 * DAY ? "active" : "dormant";
    const scored = subs.filter((s) => s.total !== null && !s.pending).map((s) => s.total as number);
    return {
      uid: u.uid, email: u.email, name: u.fullName, school: u.school, status, disabled: u.disabled, createdAt: u.createdAt,
      exams: exams.length, attempts: subs.length, attempts30: subs.filter((s) => now - s.at < 30 * DAY).length,
      distinctStudents: new Set(subs.map((s) => s.email)).size, avgScore: avg(scored),
      classes: classes.length, classStudents: students.size, pendingGrading: subs.filter((s) => s.pending).length, lastActivity,
    };
  });
}

export function buildClasses(p: Platform) {
  const { now } = p;
  const teacher = new Map(p.users.map((u) => [u.uid, u]));
  return p.classes.map((c) => {
    const members = p.members.filter((m) => m.classId === c.id);
    const mine = (list: PTimed[]) => list.filter((x) => x.classId === c.id);
    const assignments = mine(p.assignments);
    const stamps = [...members.map((m) => m.at ?? 0), ...assignments.map((a) => a.at ?? 0), ...mine(p.courses).map((x) => x.at ?? 0), ...mine(p.announcements).map((x) => x.at ?? 0)];
    const lastActivity = stamps.length ? Math.max(...stamps) : c.createdAt;
    return {
      id: c.id, name: c.name, code: c.code, active: c.active, createdAt: c.createdAt,
      teacher: c.teacherName || teacher.get(c.teacherId)?.fullName || "", teacherEmail: teacher.get(c.teacherId)?.email ?? "",
      students: members.filter((m) => m.status === "active").length, pending: members.filter((m) => m.status === "pending").length,
      assignments: assignments.length, openAssignments: assignments.filter((a) => a.extra > now).length,
      courses: mine(p.courses).filter((x) => x.extra === 1).length, announcements30: mine(p.announcements).filter((x) => x.at && now - x.at < 30 * DAY).length,
      lastActivity, dormant: !lastActivity || now - lastActivity > 30 * DAY,
    };
  });
}

export function buildRisks(p: Platform) {
  const { now } = p;
  const real = p.subs.filter((s) => !s.preview);
  const examById = new Map(p.exams.map((e) => [e.id, e]));
  const suspicious = real.filter((s) => now - s.at < 30 * DAY).map((s) => {
    const exam = examById.get(s.examId);
    const reasons: string[] = [];
    if (s.cheat >= 3) reasons.push(`Rời tab ${s.cheat} lần`);
    if (s.idle >= 300) reasons.push(`Không tương tác ${Math.round(s.idle / 60)} phút trước khi nộp`);
    if (exam && exam.duration >= 15 && s.elapsed > 0 && s.elapsed < exam.duration * 60 * 0.15) reasons.push(`Nộp sau ${Math.round(s.elapsed / 60)} phút (đề ${exam.duration} phút)`);
    if (s.total === 0 && !s.pending) reasons.push("0 điểm");
    return { id: s.id, examTitle: s.examTitle || exam?.title || "", email: s.email, at: s.at, total: s.total, reasons };
  }).filter((s) => s.reasons.length > 0).sort((a, b) => b.reasons.length - a.reasons.length || b.at - a.at).slice(0, 60);

  const nameByEmail = new Map(p.users.map((u) => [u.email, u.fullName || u.email]));
  const authorByExam = new Map(p.exams.map((e) => [e.id, e.author]));
  const stale = new Map<string, { email: string; name: string; count: number; oldestDays: number }>();
  real.filter((s) => s.pending && now - s.at > 2 * DAY).forEach((s) => {
    const a = authorByExam.get(s.examId) ?? "(không rõ)";
    const v = stale.get(a) ?? { email: a, name: nameByEmail.get(a) ?? a, count: 0, oldestDays: 0 };
    v.count++; v.oldestDays = Math.max(v.oldestDays, Math.floor((now - s.at) / DAY)); stale.set(a, v);
  });
  const waitingTeachers = p.users.filter((u) => u.role === "pending_teacher").map((u) => ({ uid: u.uid, email: u.email, name: u.fullName, school: u.school, waitingDays: Math.floor((now - (u.createdAt ?? now)) / DAY) })).sort((a, b) => b.waitingDays - a.waitingDays);
  const used = new Set(real.map((s) => s.examId));
  const unused = p.exams.filter((e) => e.createdAt && now - e.createdAt > 14 * DAY && !used.has(e.id)).map((e) => ({ id: e.id, title: e.title, author: e.author, ageDays: Math.floor((now - (e.createdAt ?? now)) / DAY) })).sort((a, b) => b.ageDays - a.ageDays).slice(0, 40);
  return {
    suspicious, staleGrading: [...stale.values()].sort((a, b) => b.oldestDays - a.oldestDays), waitingTeachers, unused,
    resets: [...p.resets].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 30),
    quality: { previews: p.subs.filter((s) => s.preview).length, noEmail: real.filter((s) => !s.email).length, zeroScore: real.filter((s) => s.total === 0 && !s.pending).length, disabledUsers: p.users.filter((u) => u.disabled).length },
  };
}
