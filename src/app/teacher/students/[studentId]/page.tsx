"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { formatDateTime } from "@/utils/examTypes";

interface SubmissionDisplay {
  id: string;
  examId: string;
  examTitle: string;
  submittedAt: Timestamp | null;
  attemptForExam: number;
  scores: { total: number; p1: number; p2: number; p3: number };
}

function Spinner() {
  return (
    <div className="flex justify-center py-24">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}

function tsMillis(ts: Timestamp | null): number {
  return ts?.toMillis() ?? 0;
}

export default function TeacherStudentDetailPage() {
  const { studentId: studentIdParam } = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();
  const fromClass = searchParams.get("fromClass");
  const { user } = useAuth();

  const studentId = decodeURIComponent(studentIdParam ?? "");

  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [rows, setRows] = useState<SubmissionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teacherEmail = user?.email ?? "";

  const backHref = useMemo(() => {
    if (fromClass) return `/teacher/classes/${encodeURIComponent(fromClass)}`;
    return "/teacher/classes";
  }, [fromClass]);

  useEffect(() => {
    if (!studentId || !teacherEmail) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const uSnap = await getDoc(doc(db, "users", studentId));
        if (!uSnap.exists()) {
          if (!cancelled) setError("Không tìm thấy học sinh.");
          return;
        }
        const u = uSnap.data();
        if ((u.role ?? "student") !== "student") {
          if (!cancelled) setError("Người dùng không phải học sinh.");
          return;
        }

        const email = String(u.email ?? "").trim().toLowerCase();
        const name = String(u.fullName ?? "");

        // Exams teacher manages = own authored exams OR globally shared exams.
        // Current schema uses `authorEmail` + `isShared` (no per-teacher sharedWith list).
        const [authoredExamSnap, sharedExamSnap] = await Promise.all([
          getDocs(query(collection(db, "exams"), where("authorEmail", "==", teacherEmail))),
          getDocs(query(collection(db, "exams"), where("isShared", "==", true))),
        ]);
        const teacherExamIds = new Set<string>();
        const examTitles = new Map<string, string>();
        authoredExamSnap.docs.forEach((d) => {
          teacherExamIds.add(d.id);
          examTitles.set(d.id, String(d.data().title ?? ""));
        });
        sharedExamSnap.docs.forEach((d) => {
          teacherExamIds.add(d.id);
          if (!examTitles.has(d.id)) {
            examTitles.set(d.id, String(d.data().title ?? ""));
          }
        });

        const subDocs = email
          ? (await getDocs(query(collection(db, "submissions"), where("studentEmail", "==", email))))
              .docs
          : [];

        const filtered = subDocs
          .map((d) => {
            const sd = d.data();
            const status = String(sd.status ?? "");
            if (status !== "COMPLETED") return null;
            const examId = String(sd.examId ?? "");
            if (!teacherExamIds.has(examId)) return null;
            return {
              id: d.id,
              examId,
              examTitle:
                String(sd.examTitle ?? "") || examTitles.get(examId) || "—",
              submittedAt: (sd.submittedAt ?? null) as Timestamp | null,
              scores:
                sd.scores && typeof sd.scores === "object"
                  ? (sd.scores as SubmissionDisplay["scores"])
                  : { total: 0, p1: 0, p2: 0, p3: 0 },
            };
          })
          .filter(Boolean) as Omit<SubmissionDisplay, "attemptForExam">[];

        const byExam = new Map<string, typeof filtered>();
        for (const sub of filtered) {
          const list = byExam.get(sub.examId) ?? [];
          list.push(sub);
          byExam.set(sub.examId, list);
        }

        const attemptMap = new Map<string, number>();
        for (const [, list] of byExam) {
          const chronological = [...list].sort((a, b) => tsMillis(a.submittedAt) - tsMillis(b.submittedAt));
          chronological.forEach((s, idx) => {
            attemptMap.set(s.id, idx + 1);
          });
        }

        const enriched: SubmissionDisplay[] = filtered.map((s) => ({
          ...s,
          attemptForExam: attemptMap.get(s.id) ?? 1,
        }));

        enriched.sort((a, b) => tsMillis(b.submittedAt) - tsMillis(a.submittedAt));

        if (!cancelled) {
          setStudentName(name);
          setStudentEmail(email);
          setRows(enriched);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Không thể tải dữ liệu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, teacherEmail]);

  const returnQuery =
    `/teacher/students/${encodeURIComponent(studentId)}${fromClass ? `?fromClass=${encodeURIComponent(fromClass)}` : ""}`;

  return (
    <AdminGuard>
      <div className="max-w-5xl mx-auto px-4 py-10 w-full">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          <Link href={backHref} className="text-indigo-600 hover:text-indigo-800 font-semibold">
            ← {fromClass ? "Quay lại lớp học" : "Quản lý lớp học"}
          </Link>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-700 font-semibold">
            {error}
          </div>
        ) : (
          <>
            <header className="mb-8 rounded-3xl bg-white border border-gray-100 shadow-sm p-8">
              <p className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                Học sinh
              </p>
              <h1 className="text-2xl font-extrabold text-gray-900">{studentName || "—"}</h1>
              <p className="text-sm text-gray-500 mt-1">{studentEmail}</p>
              <p className="text-sm text-gray-400 mt-3">
                Hiển thị bài làm của các đề do bạn tạo hoặc được chia sẻ với bạn.
              </p>
            </header>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h2 className="font-extrabold text-gray-900">Bài thi đã làm</h2>
              </div>

              {rows.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm font-medium px-6">
                  Chưa có dữ liệu bài làm cho các đề do bạn quản lý.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-semibold">Đề thi</th>
                        <th className="text-center px-3 py-3 font-semibold">Lần làm</th>
                        <th className="text-center px-3 py-3 font-semibold">P1</th>
                        <th className="text-center px-3 py-3 font-semibold">P2</th>
                        <th className="text-center px-3 py-3 font-semibold">P3</th>
                        <th className="text-center px-3 py-3 font-semibold">Tổng</th>
                        <th className="text-left px-4 py-3 font-semibold">Nộp lúc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((r, i) => (
                        <tr key={r.id} className={i % 2 === 1 ? "bg-gray-50/40" : ""}>
                          <td className="px-4 py-3 align-middle font-semibold text-gray-800 max-w-[200px]">
                            <Link
                              href={`/teacher/review/${encodeURIComponent(r.id)}?returnTo=${encodeURIComponent(returnQuery)}`}
                              className="text-indigo-600 hover:text-indigo-900 hover:underline"
                            >
                              {r.examTitle}
                            </Link>
                          </td>
                          <td className="px-3 py-3 align-middle text-center font-bold text-gray-700">
                            {r.attemptForExam}
                          </td>
                          <td className="px-3 py-3 align-middle text-center text-gray-700">
                            {typeof r.scores.p1 === "number" ? r.scores.p1 : "—"}
                          </td>
                          <td className="px-3 py-3 align-middle text-center text-gray-700">
                            {typeof r.scores.p2 === "number" ? r.scores.p2 : "—"}
                          </td>
                          <td className="px-3 py-3 align-middle text-center text-gray-700">
                            {typeof r.scores.p3 === "number" ? r.scores.p3 : "—"}
                          </td>
                          <td className="px-3 py-3 align-middle text-center">
                            <span className="inline-flex px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-extrabold border border-emerald-100">
                              {typeof r.scores.total === "number" ? r.scores.total : "—"}/10
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-gray-500 whitespace-nowrap text-xs">
                            {formatDateTime(r.submittedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 mt-4 px-1">
              Mở tên đề để xem chi tiết P1/P2/P3 và đáp án đã làm của học sinh.
            </p>
          </>
        )}
      </div>
    </AdminGuard>
  );
}
