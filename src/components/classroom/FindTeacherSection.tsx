"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import type { UserProfile } from "@/lib/AuthContext";
import { normalizeTeacherSearchInput } from "@/utils/searchKeywords";
import type { ClassDoc } from "@/utils/classroomTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassSummary {
  id: string;
  name: string;
  classCode: string;
  studentCount: number;
}

interface TeacherRow extends UserProfile {
  expanded: boolean;
  classes: ClassSummary[] | null; // null = not yet loaded
  classesLoading: boolean;
}

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// ── Avatar initials ───────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FindTeacherSection() {
  const [searchInput, setSearchInput] = useState("");
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const debouncedInput = useDebounce(searchInput, 400);

  // Run search whenever debounced input changes
  useEffect(() => {
    if (debouncedInput.trim().length < 2) {
      queueMicrotask(() => {
        setTeachers([]);
        setHasSearched(false);
        setError("");
      });
      return;
    }

    const doSearch = async () => {
      setSearching(true);
      setError("");
      try {
        const searchToken = normalizeTeacherSearchInput(debouncedInput);
        if (searchToken.length < 2) {
          queueMicrotask(() => {
            setTeachers([]);
            setHasSearched(false);
          });
          return;
        }

        const snap = await getDocs(
          query(
            collection(db, "users"),
            where("role", "in", ["mod", "admin"]),
            where("searchKeywords", "array-contains", searchToken),
            limit(20)
          )
        );
        const results = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));

        setTeachers(
          results.map((t) => ({ ...t, expanded: false, classes: null, classesLoading: false }))
        );
        setHasSearched(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        // Firestore missing-index errors contain a URL to create the index
        if (msg.includes("index") || msg.includes("Index")) {
          setError(
            "Chức năng tìm kiếm cần cấu hình thêm trong Firebase. Liên hệ quản trị viên."
          );
        } else {
          setError("Không thể tìm kiếm lúc này. Vui lòng thử lại sau.");
        }
        setTeachers([]);
      } finally {
        setSearching(false);
      }
    };

    doSearch();
  }, [debouncedInput]);

  // Toggle expand and lazy-load classes for a teacher
  const toggleExpand = async (idx: number) => {
    const teacher = teachers[idx];

    if (teacher.expanded) {
      setTeachers((prev) => prev.map((t, i) => (i === idx ? { ...t, expanded: false } : t)));
      return;
    }

    // Mark expanded + loading
    setTeachers((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, expanded: true, classesLoading: true } : t))
    );

    try {
      const snap = await getDocs(
        query(
          collection(db, "classes"),
          where("teacherId", "==", teacher.uid),
          where("isActive", "==", true)
        )
      );
      const classes: ClassSummary[] = snap.docs.map((d) => {
        const data = d.data() as ClassDoc;
        return {
          id: d.id,
          name: data.name,
          classCode: data.classCode,
          studentCount: data.studentIds.length,
        };
      });
      setTeachers((prev) =>
        prev.map((t, i) => (i === idx ? { ...t, classes, classesLoading: false } : t))
      );
    } catch {
      setTeachers((prev) =>
        prev.map((t, i) => (i === idx ? { ...t, classes: [], classesLoading: false } : t))
      );
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-purple-100 rounded-2xl flex items-center justify-center text-xl shrink-0">
          🔍
        </div>
        <div>
          <h2 className="font-extrabold text-gray-900">Tìm giáo viên</h2>
          <p className="text-xs text-gray-500 mt-0.5">Tìm theo tên, email hoặc số điện thoại</p>
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-5">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Nhập tên giáo viên, email…"
          className="w-full pl-10 pr-10 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-sm transition-colors"
        />
        {searching && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
        )}
        {!searching && searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
          >
            <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Results area */}
      {error ? (
        <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <span>⚠️</span> {error}
        </div>
      ) : searchInput.trim().length < 2 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">Nhập ít nhất 2 ký tự để bắt đầu tìm kiếm</p>
        </div>
      ) : searching ? null : hasSearched && teachers.length === 0 ? (
        <div className="text-center py-10">
          <span className="text-4xl">👀</span>
          <p className="text-gray-500 text-sm mt-3">Không tìm thấy giáo viên phù hợp</p>
          <p className="text-gray-400 text-xs mt-1">Thử tên khác hoặc liên hệ trực tiếp</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teachers.map((teacher, idx) => (
            <div
              key={teacher.uid}
              className="border-2 border-gray-100 hover:border-purple-200 rounded-2xl overflow-hidden transition-colors"
            >
              {/* Teacher summary row — click to expand */}
              <button
                onClick={() => toggleExpand(idx)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-purple-50/40 transition-colors"
              >
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-extrabold text-sm shrink-0 select-none">
                  {initials(teacher.fullName)}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate text-sm">{teacher.fullName}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{teacher.school}</p>
                </div>

                <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-semibold">
                  Giáo viên
                </span>

                <svg
                  className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${
                    teacher.expanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded: class list */}
              {teacher.expanded && (
                <div className="border-t-2 border-gray-100 bg-gray-50/50 px-4 py-4">
                  {teacher.classesLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
                    </div>
                  ) : !teacher.classes || teacher.classes.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">
                      Giáo viên này chưa mở lớp học nào.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">
                        Lớp học đang mở · {teacher.classes.length} lớp
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {teacher.classes.map((cls) => (
                          <div
                            key={cls.id}
                            className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 gap-3"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 text-sm truncate">{cls.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                👨‍🎓 {cls.studentCount} học sinh
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-black text-indigo-700 text-xl font-mono tracking-widest leading-none">
                                {cls.classCode}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">mã lớp</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
