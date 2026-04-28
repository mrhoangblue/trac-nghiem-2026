"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Tab = "student" | "teacher";

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();

  const [tab, setTab] = useState<Tab>("student");
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("Royal School");
  const [classValue, setClassValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!user) return;
    setError("");

    if (!fullName.trim()) { setError("Vui lòng nhập họ và tên."); return; }
    if (!school.trim()) { setError("Vui lòng nhập tên trường."); return; }
    if (tab === "student" && !classValue.trim()) { setError("Vui lòng nhập lớp."); return; }

    setSaving(true);
    try {
      const role = tab === "student" ? "student" : "pending_teacher";
      const data: Record<string, unknown> = {
        uid: user.uid,
        email: user.email,
        fullName: fullName.trim(),
        school: school.trim(),
        role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tab === "student") data.class = classValue.trim();

      await setDoc(doc(db, "users", user.uid), data, { merge: true });
      await refreshProfile();
      // AuthProvider route guard sẽ tự redirect về / sau khi profile đầy đủ
    } catch (err) {
      console.error("Lỗi lưu profile:", err);
      setError("Có lỗi xảy ra. Vui lòng thử lại.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-8 text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">
            ∑
          </div>
          <h1 className="text-2xl font-extrabold text-white">Chào mừng!</h1>
          <p className="text-blue-100 mt-1 text-sm">
            Hoàn thành thông tin để bắt đầu sử dụng hệ thống.
          </p>
          {user?.displayName && (
            <p className="text-white/80 text-xs mt-2">
              Đăng nhập với tài khoản: <strong>{user.displayName}</strong>
            </p>
          )}
        </div>

        <div className="p-8">
          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6 gap-1">
            {(["student", "teacher"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  tab === t
                    ? "bg-white shadow text-blue-700"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t === "student" ? "🎓 Học sinh" : "📚 Giáo viên"}
              </button>
            ))}
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Trường <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
              />
            </div>

            {tab === "student" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Lớp <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={classValue}
                  onChange={(e) => setClassValue(e.target.value)}
                  placeholder="VD: 12A1"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                />
              </div>
            )}

            {/* Notice for teacher */}
            {tab === "teacher" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <span className="text-amber-500 text-lg shrink-0">⏳</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Chờ phê duyệt</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                    Tài khoản giáo viên cần được admin phê duyệt trước khi tạo được đề thi.
                    Bạn vẫn có thể làm bài và xem lịch sử trong thời gian chờ.
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0 text-sm mt-2"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang lưu…
                </span>
              ) : (
                "Bắt đầu sử dụng →"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
