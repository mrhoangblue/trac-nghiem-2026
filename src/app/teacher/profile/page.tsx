"use client";

import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { generateSearchKeywords } from "@/utils/searchKeywords";

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-500 text-sm animate-pulse">Đang tải hồ sơ…</p>
    </div>
  );
}

export default function TeacherProfilePage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      queueMicrotask(() => setLoadingDoc(false));
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const d = snap.data();
        if (cancelled) return;
        setFullName(String(d?.fullName ?? userProfile?.fullName ?? ""));
        setPhoneNumber(String(d?.phoneNumber ?? ""));
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, userProfile?.fullName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !user.email) return;

    const name = fullName.trim();
    const phone = phoneNumber.trim();
    if (!name) {
      setMessage({ type: "err", text: "Vui lòng nhập họ và tên." });
      return;
    }
    if (!phone) {
      setMessage({ type: "err", text: "Vui lòng nhập số điện thoại." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        fullName: name,
        phoneNumber: phone,
        searchKeywords: generateSearchKeywords(name, user.email, phone),
        updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      setMessage({ type: "ok", text: "Đã cập nhật hồ sơ và từ khóa tìm kiếm." });
    } catch (err) {
      console.error(err);
      setMessage({ type: "err", text: "Không thể lưu. Vui lòng thử lại." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminGuard>
      <div className="max-w-lg mx-auto px-4 py-10 w-full">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Hồ sơ giáo viên</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Cập nhật họ tên và số điện thoại để học sinh tìm thấy bạn khi nhập đúng cụm từ không dấu.
          </p>
        </header>

        {loadingDoc ? (
          <Spinner />
        ) : (
          <form
            onSubmit={handleSave}
            className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5"
          >
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                readOnly
                value={user?.email ?? ""}
                className="w-full rounded-xl px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                placeholder="Nguyễn Văn A"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Số điện thoại <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="tel"
                inputMode="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                placeholder="0901234567"
              />
            </div>

            {message && (
              <div
                className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  message.type === "ok"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </form>
        )}
      </div>
    </AdminGuard>
  );
}
