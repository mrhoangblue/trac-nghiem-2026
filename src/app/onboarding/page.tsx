"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/AuthContext";

type Tab = "student" | "teacher";

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();

  const [tab, setTab] = useState<Tab>("student");
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("Royal School");
  const [classValue, setClassValue] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setError("");

    if (!fullName.trim()) { setError("Vui lòng nhập họ và tên."); return; }
    if (!school.trim()) { setError("Vui lòng nhập tên trường."); return; }
    if (tab === "student" && !classValue.trim()) { setError("Vui lòng nhập lớp."); return; }
    if (!phoneNumber.trim()) { setError("Vui lòng nhập số điện thoại."); return; }

    setSaving(true);
    try {
      const role = tab === "student" ? "student" : "pending_teacher";
      const saveProfile = async (forceRefresh = false) => {
        const token = await user.getIdToken(forceRefresh);
        return fetch("/api/profile/onboarding", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            role,
            fullName,
            school,
            className: tab === "student" ? classValue : "",
            phoneNumber,
          }),
        });
      };

      let response = await saveProfile();
      if (response.status === 401) {
        response = await saveProfile(true);
      }

      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        if (result?.error === "INVALID_INPUT") {
          throw new Error("INVALID_INPUT");
        }
        if (result?.error === "UNAUTHENTICATED") {
          throw new Error("UNAUTHENTICATED");
        }
        throw new Error("SAVE_FAILED");
      }

      await refreshProfile();
      // AuthProvider route guard sẽ tự redirect về / sau khi profile đầy đủ
    } catch (err) {
      console.error("Lỗi lưu profile:", err);
      const code = err instanceof Error ? err.message : "SAVE_FAILED";
      if (code === "INVALID_INPUT") {
        setError("Thông tin chưa hợp lệ. Kiểm tra lại họ tên, trường, lớp và số điện thoại.");
      } else if (code === "UNAUTHENTICATED") {
        setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      } else {
        setError("Không thể lưu thông tin lúc này. Vui lòng thử lại.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-brand-50 to-brand-50 flex items-center justify-center p-4">
      <div className="workspace-surface bg-white rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-600 px-8 py-8 text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">
            ∑
          </div>
          <h1 className="text-2xl font-extrabold text-white">Chào mừng!</h1>
          <p className="text-brand-100 mt-1 text-sm">
            Hoàn thành thông tin để bắt đầu sử dụng hệ thống.
          </p>
          {user?.displayName && (
            <p className="text-white/80 text-xs mt-2">
              Đăng nhập với tài khoản: <strong>{user.displayName}</strong>
            </p>
          )}
        </div>

        <form className="p-8" onSubmit={handleSubmit}>
          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6 gap-1">
            {(["student", "teacher"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  tab === t
                    ? "bg-white shadow text-brand-700"
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
                Họ và tên <span className="text-danger-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
                maxLength={120}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Trường <span className="text-danger-500">*</span>
              </label>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                maxLength={200}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all"
              />
            </div>

            {tab === "student" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Lớp <span className="text-danger-500">*</span>
                </label>
                <input
                  type="text"
                  value={classValue}
                  onChange={(e) => setClassValue(e.target.value)}
                  placeholder="VD: 12A1"
                  maxLength={80}
                  required
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Số điện thoại <span className="text-danger-500">*</span>
              </label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="VD: 0901234567"
                maxLength={20}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Dùng để xác minh hồ sơ và hỗ trợ liên hệ khi cần.
              </p>
            </div>

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
              <div className="bg-danger-50 border border-danger-200 rounded-xl px-4 py-3">
                <p className="text-sm text-danger-600 font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0 text-sm mt-2"
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
        </form>
      </div>
    </div>
  );
}
