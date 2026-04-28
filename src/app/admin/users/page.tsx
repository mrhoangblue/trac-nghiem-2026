"use client";

import { useEffect, useState, useCallback } from "react";
import AdminGuard from "@/components/AdminGuard";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  Timestamp,
} from "firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "admin" | "mod" | "student" | "pending_teacher";

interface UserRow {
  uid: string;
  email: string;
  fullName: string;
  school: string;
  role: Role;
  class?: string;
  createdAt?: Timestamp | null;
  submissionCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, { label: string; cls: string }> = {
    admin: { label: "Admin", cls: "bg-blue-100 text-blue-700" },
    mod: { label: "Giáo viên", cls: "bg-emerald-100 text-emerald-700" },
    student: { label: "Học sinh", cls: "bg-purple-100 text-purple-700" },
    pending_teacher: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" },
  };
  const { label, cls } = map[role] ?? { label: role, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-400 text-sm animate-pulse">Đang tải…</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const STUDENT_LIMIT = 100;

type TabKey = "pending" | "staff" | "students";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("pending");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all users
      const userSnap = await getDocs(query(collection(db, "users")));

      // Fetch all submissions to count per user email
      const subSnap = await getDocs(collection(db, "submissions"));
      const countByEmail: Record<string, number> = {};
      subSnap.docs.forEach((d) => {
        const email = d.data().studentEmail as string;
        if (email) countByEmail[email] = (countByEmail[email] ?? 0) + 1;
      });

      const rows: UserRow[] = userSnap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email ?? "—",
          fullName: data.fullName ?? "—",
          school: data.school ?? "—",
          role: (data.role ?? "student") as Role,
          class: data.class,
          createdAt: data.createdAt ?? null,
          submissionCount: countByEmail[data.email] ?? 0,
        };
      });

      setUsers(rows);
    } catch (err) {
      console.error("Lỗi tải users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const approveTeacher = async (uid: string) => {
    setActionId(uid);
    try {
      await updateDoc(doc(db, "users", uid), { role: "mod" });
      setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, role: "mod" } : u));
    } catch (err) {
      console.error(err);
      alert("Lỗi khi phê duyệt. Vui lòng thử lại.");
    } finally {
      setActionId(null);
    }
  };

  const rejectTeacher = async (uid: string, name: string) => {
    if (!confirm(`Từ chối giáo viên "${name}"?\nTài khoản sẽ bị xóa khỏi hệ thống.`)) return;
    setActionId(uid);
    try {
      await deleteDoc(doc(db, "users", uid));
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (err) {
      console.error(err);
      alert("Lỗi khi từ chối. Vui lòng thử lại.");
    } finally {
      setActionId(null);
    }
  };

  // Derived lists
  const pendingTeachers = users.filter((u) => u.role === "pending_teacher");
  const staff = users.filter((u) => u.role === "admin" || u.role === "mod");
  const students = users.filter((u) => u.role === "student");

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "pending", label: "Chờ duyệt", count: pendingTeachers.length },
    { key: "staff", label: "Admin & Mod", count: staff.length },
    { key: "students", label: "Học sinh", count: students.length },
  ];

  // ── Shared table columns ───────────────────────────────────────────────────
  function UserTable({
    rows,
    showActions = false,
    showClass = false,
  }: {
    rows: UserRow[];
    showActions?: boolean;
    showClass?: boolean;
  }) {
    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
          <span className="text-4xl">📭</span>
          <p className="text-sm">Không có dữ liệu.</p>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <th className="text-left px-6 py-3 font-semibold">Họ tên</th>
              <th className="text-left px-6 py-3 font-semibold">Email</th>
              <th className="text-left px-4 py-3 font-semibold">Trường</th>
              {showClass && <th className="text-center px-4 py-3 font-semibold">Lớp</th>}
              <th className="text-center px-4 py-3 font-semibold">Vai trò</th>
              <th className="text-center px-4 py-3 font-semibold">Bài đã làm</th>
              <th className="text-center px-4 py-3 font-semibold">Ngày đăng ký</th>
              {showActions && (
                <th className="text-center px-6 py-3 font-semibold">Hành động</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((u, i) => (
              <tr
                key={u.uid}
                className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/40" : ""}`}
              >
                <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                  {u.fullName}
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">{u.email}</td>
                <td className="px-4 py-4 text-gray-600 text-xs">{u.school}</td>
                {showClass && (
                  <td className="px-4 py-4 text-center text-gray-600 text-xs">
                    {u.class ?? "—"}
                  </td>
                )}
                <td className="px-4 py-4 text-center">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-xs">
                    {u.submissionCount}
                  </span>
                </td>
                <td className="px-4 py-4 text-center text-gray-400 text-xs">
                  {formatDate(u.createdAt)}
                </td>
                {showActions && (
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => approveTeacher(u.uid)}
                        disabled={actionId === u.uid}
                        className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-semibold border border-emerald-200 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition-all text-xs disabled:opacity-40"
                      >
                        {actionId === u.uid ? (
                          <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          "✅ Phê duyệt"
                        )}
                      </button>
                      <button
                        onClick={() => rejectTeacher(u.uid, u.fullName)}
                        disabled={actionId === u.uid}
                        className="inline-flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-all text-xs disabled:opacity-40"
                      >
                        ❌ Từ chối
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AdminGuard adminOnly>
      <div className="max-w-7xl mx-auto px-4 py-12 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">Quản lý Người dùng</h1>
            <p className="text-gray-500 mt-1">Duyệt giáo viên và quản lý tài khoản.</p>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 font-semibold py-2 px-4 rounded-xl transition-all text-sm"
          >
            ↻ Làm mới
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-6 max-w-lg">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === t.key
                  ? "bg-white shadow text-blue-700"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className={`text-xs font-extrabold px-1.5 py-0.5 rounded-full ${
                    activeTab === t.key
                      ? t.key === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Card header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            {activeTab === "pending" && (
              <>
                <h2 className="font-bold text-gray-800">Giáo viên chờ phê duyệt</h2>
                {pendingTeachers.length > 0 && (
                  <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                    {pendingTeachers.length} đang chờ
                  </span>
                )}
              </>
            )}
            {activeTab === "staff" && (
              <h2 className="font-bold text-gray-800">Admin & Giáo viên ({staff.length})</h2>
            )}
            {activeTab === "students" && (
              <>
                <h2 className="font-bold text-gray-800">Danh sách Học sinh</h2>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  students.length >= STUDENT_LIMIT
                    ? "bg-red-100 text-red-700"
                    : "bg-purple-100 text-purple-700"
                }`}>
                  Số lượng: {students.length} / {STUDENT_LIMIT}
                </span>
              </>
            )}
          </div>

          {loading ? (
            <Spinner />
          ) : (
            <>
              {activeTab === "pending" && (
                <>
                  {pendingTeachers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                      <span className="text-4xl">🎉</span>
                      <p className="text-sm">Không có giáo viên nào đang chờ duyệt.</p>
                    </div>
                  ) : (
                    <UserTable rows={pendingTeachers} showActions />
                  )}
                </>
              )}
              {activeTab === "staff" && <UserTable rows={staff} />}
              {activeTab === "students" && <UserTable rows={students} showClass />}
            </>
          )}
        </div>

        {/* Student limit warning */}
        {activeTab === "students" && students.length >= STUDENT_LIMIT * 0.9 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
            <span className="text-amber-500 text-xl">⚠️</span>
            <p className="text-sm text-amber-800 font-medium">
              Đã đạt {Math.round((students.length / STUDENT_LIMIT) * 100)}% giới hạn học sinh ({students.length}/{STUDENT_LIMIT}).
            </p>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
