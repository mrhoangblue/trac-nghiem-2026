"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import JoinClassSection from "@/components/classroom/JoinClassSection";
import FindTeacherSection from "@/components/classroom/FindTeacherSection";
import type { ClassDoc } from "@/utils/classroomTypes";

interface JoinedClass {
  id: string;
  name: string;
  classCode: string;
  teacherName: string;
  studentCount: number;
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải lớp học…</p>
    </div>
  );
}

export default function StudentClassesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [classes, setClasses] = useState<JoinedClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    setClassesLoading(true);
    const fetchClasses = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "classes"),
            where("studentIds", "array-contains", user.uid),
            where("isActive", "==", true)
          )
        );
        setClasses(
          snap.docs.map((d) => {
            const data = d.data() as ClassDoc;
            return {
              id: d.id,
              name: data.name,
              classCode: data.classCode,
              teacherName: data.teacherName ?? "",
              studentCount: data.studentIds.length,
            };
          })
        );
      } catch (err) {
        console.error("Failed to fetch classes:", err);
      } finally {
        setClassesLoading(false);
      }
    };
    fetchClasses();
  }, [user]);

  if (authLoading) return <Spinner />;

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <div className="text-6xl mb-6">🔐</div>
        <h2 className="text-2xl font-extrabold text-gray-800 mb-3">Cần đăng nhập</h2>
        <p className="text-gray-500 mb-8">Vui lòng đăng nhập để xem lớp học của bạn.</p>
        <Link
          href="/"
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
        >
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 w-full space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900">Lớp học của tôi</h1>
        <p className="text-gray-500 mt-1">Xem các lớp bạn đã tham gia hoặc tìm và tham gia lớp mới.</p>
      </div>

      {/* Joined classes */}
      <section>
        <h2 className="text-lg font-bold text-gray-800 mb-4">Lớp đang tham gia</h2>
        {classesLoading ? (
          <Spinner />
        ) : classes.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm text-center py-14 px-6">
            <div className="text-5xl mb-4">🏫</div>
            <p className="font-bold text-gray-700 text-lg mb-1">Bạn chưa tham gia lớp nào</p>
            <p className="text-gray-400 text-sm">Nhập mã lớp bên dưới để tham gia lớp học của giáo viên.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{cls.name}</p>
                  {cls.teacherName && (
                    <p className="text-sm text-gray-500 mt-0.5 truncate">GV: {cls.teacherName}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">👨‍🎓 {cls.studentCount} học sinh</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-black text-indigo-700 text-2xl font-mono tracking-widest leading-none">
                    {cls.classCode}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">mã lớp</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-sm font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
          Tham gia lớp mới
        </span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Join + Find teacher */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <JoinClassSection
          user={user}
          fullName={user.displayName ?? user.email ?? "Học sinh"}
        />
        <FindTeacherSection />
      </div>
    </div>
  );
}
