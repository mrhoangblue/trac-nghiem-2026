"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  BookOpenCheck, Camera, Check, Globe2, Layers, Loader2, LogOut, Mail, MonitorSmartphone,
  Presentation, School, ShieldCheck, Trash2, UserRound, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import StateIcon from "@/components/StateIcon";
import { EXAM_TYPES, GRADE_LEVELS } from "@/components/Sidebar";
import { ChoiceCards, Field, NumberField, SelectMenu, SubHeading, Toggle, inputClass } from "@/components/exam-editor/EditorKit";
import { EXAM_FONT_SCALE, resolveUserSettings, type ExamDefaults, type ExamFontScale, type UserSettings } from "@/utils/userSettings";

type TabId = "profile" | "study" | "teaching" | "security";

const ROLE_LABEL: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-white/20 text-white" },
  mod: { label: "Giáo viên", className: "bg-white/20 text-white" },
  pending_teacher: { label: "Giáo viên chờ duyệt", className: "bg-amber-300/90 text-amber-950" },
  student: { label: "Học sinh", className: "bg-white/20 text-white" },
};

const SAVE_ERRORS: Record<string, string> = {
  fullName: "Họ tên chưa hợp lệ.",
  school: "Tên trường chưa hợp lệ.",
  phoneNumber: "Số điện thoại cần 9–15 chữ số.",
  className: "Lớp chưa hợp lệ.",
};

/** Cắt giữa và thu nhỏ ảnh về 256×256 WebP trước khi tải lên. */
async function resizeAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("ENCODE_FAILED"))), "image/webp", 0.86));
}

function SaveBar({ dirty, saving, message, onReset }: { dirty: boolean; saving: boolean; message: { ok: boolean; text: string } | null; onReset?: () => void }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-5">
      {message && (
        <p role="status" className={`mr-auto flex items-center gap-1.5 text-sm font-semibold ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {message.ok && <Check size={15} aria-hidden="true" />}{message.text}
        </p>
      )}
      {onReset && dirty && !saving && (
        <button type="button" onClick={onReset} className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800">Hoàn tác</button>
      )}
      <button type="submit" disabled={!dirty || saving} className="edu-btn inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50">
        {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {saving ? "Đang lưu…" : "Lưu thay đổi"}
      </button>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-soft)] sm:p-7">
      <h2 className="font-display text-lg font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function AccountPage() {
  const { user, userProfile, isMod, logout, refreshProfile } = useAuth();
  const role = userProfile?.role ?? "student";
  const isTeacher = role === "admin" || role === "mod" || role === "pending_teacher";
  const saved = resolveUserSettings(userProfile?.settings);

  const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
    { id: "profile", label: "Hồ sơ", icon: UserRound },
    { id: "study", label: isTeacher ? "Hiển thị đề" : "Học tập", icon: BookOpenCheck },
    ...(isMod ? [{ id: "teaching" as const, label: "Giảng dạy", icon: Presentation }] : []),
    { id: "security", label: "Bảo mật", icon: ShieldCheck },
  ];
  const [tab, setTab] = useState<TabId>(() => {
    const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab");
    return tabs.some((item) => item.id === requested) ? (requested as TabId) : "profile";
  });
  const selectTab = (next: TabId) => {
    setTab(next);
    window.history.replaceState(null, "", next === "profile" ? "/tai-khoan" : `/tai-khoan?tab=${next}`);
  };

  // ── Hồ sơ ────────────────────────────────────────────────────────────────
  const initialProfile = {
    fullName: userProfile?.fullName ?? "",
    school: userProfile?.school ?? "",
    phoneNumber: userProfile?.phoneNumber ?? "",
    className: userProfile?.class ?? "",
  };
  const [profile, setProfile] = useState(initialProfile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const profileDirty = (Object.keys(initialProfile) as Array<keyof typeof initialProfile>).some((key) => profile[key].trim() !== initialProfile[key]);

  // ── Cài đặt ──────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<UserSettings>(saved);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const setDefaults = (patch: Partial<ExamDefaults>) => setSettings((current) => ({ ...current, examDefaults: { ...current.examDefaults, ...patch } }));

  // ── Ảnh đại diện ─────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarUrl = userProfile?.avatarUrl || user?.photoURL || "";

  // ── Bảo mật ──────────────────────────────────────────────────────────────
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!user || !userProfile) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-28 text-center">
        <StateIcon icon="lock" />
        <h1 className="font-display text-2xl font-extrabold text-gray-900">Cần đăng nhập</h1>
        <p className="text-gray-500">Đăng nhập để xem và chỉnh sửa tài khoản của bạn.</p>
        <Link href="/" className="edu-btn inline-flex h-11 items-center rounded-xl px-6 text-sm font-semibold text-white">Về trang chủ</Link>
      </div>
    );
  }

  const authorizedFetch = async (input: string, init: RequestInit = {}) => {
    const token = await user.getIdToken();
    return fetch(input, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const response = await authorizedFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: profile.fullName,
          school: profile.school,
          phoneNumber: profile.phoneNumber,
          ...(isTeacher ? {} : { className: profile.className }),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; fields?: string[] } | null;
      if (!response.ok) {
        throw new Error(payload?.fields?.map((field) => SAVE_ERRORS[field]).filter(Boolean).join(" ") || "Không thể lưu. Vui lòng thử lại.");
      }
      await refreshProfile();
      setProfileMessage({ ok: true, text: "Đã lưu hồ sơ." });
    } catch (error) {
      setProfileMessage({ ok: false, text: error instanceof Error ? error.message : "Không thể lưu." });
    } finally {
      setProfileSaving(false);
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSettingsSaving(true);
    setSettingsMessage(null);
    try {
      const response = await authorizedFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const payload = (await response.json().catch(() => null)) as { settings?: UserSettings } | null;
      if (!response.ok || !payload?.settings) throw new Error();
      setSettings(payload.settings);
      await refreshProfile();
      setSettingsMessage({ ok: true, text: "Đã lưu cài đặt." });
    } catch {
      setSettingsMessage({ ok: false, text: "Không thể lưu cài đặt. Vui lòng thử lại." });
    } finally {
      setSettingsSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setAvatarError("");
    if (!file.type.startsWith("image/")) {
      setAvatarError("Hãy chọn một file ảnh.");
      return;
    }
    setAvatarBusy(true);
    try {
      const blob = await resizeAvatar(file);
      const form = new FormData();
      form.set("file", new File([blob], "avatar.webp", { type: blob.type || "image/webp" }));
      const response = await authorizedFetch("/api/profile/avatar", { method: "POST", body: form });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error === "R2_NOT_READY" ? "Kho ảnh chưa sẵn sàng, hãy thử lại sau." : "Không thể tải ảnh lên.");
      }
      await refreshProfile();
    } catch (error) {
      setAvatarError(error instanceof Error && error.message.length > 20 ? error.message : "Không đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG khác.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const response = await authorizedFetch("/api/profile/avatar", { method: "DELETE" });
      if (!response.ok) throw new Error();
      await refreshProfile();
    } catch {
      setAvatarError("Không thể gỡ ảnh. Vui lòng thử lại.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const revokeSessions = async () => {
    setRevoking(true);
    setRevokeMessage(null);
    try {
      const response = await authorizedFetch("/api/profile/sessions", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setRevokeMessage({ ok: true, text: "Đã thu hồi. Các thiết bị khác sẽ bị đăng xuất trong vòng 1 giờ." });
      setConfirmRevoke(false);
    } catch {
      setRevokeMessage({ ok: false, text: "Không thể thu hồi phiên. Vui lòng thử lại." });
    } finally {
      setRevoking(false);
    }
  };

  const roleBadge = ROLE_LABEL[role] ?? ROLE_LABEL.student;
  const lastSignIn = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString("vi-VN") : "—";
  const createdAt = user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString("vi-VN") : "—";

  return (
    <div className="workspace-page mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      {/* Thẻ đầu trang */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-500 p-5 text-white shadow-[0_20px_50px_-20px_rgb(79_70_229/.6)] sm:p-7">
        <div aria-hidden="true" className="edu-dots pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative h-24 w-24 shrink-0">
            {avatarUrl ? (
              // Ảnh Google hoặc R2: kích thước nhỏ, không cần tối ưu qua next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Ảnh đại diện" referrerPolicy="no-referrer" className="h-24 w-24 rounded-3xl object-cover ring-4 ring-white/30" />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/20 font-display text-4xl font-extrabold ring-4 ring-white/30">{userProfile.fullName.charAt(0).toUpperCase() || "?"}</span>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              aria-label="Đổi ảnh đại diện"
              className="absolute -bottom-1.5 -right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo-700 shadow-lg transition hover:scale-105 disabled:opacity-60"
            >
              {avatarBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = ""; }} />
          </div>
          <div className="min-w-0 flex-1">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${roleBadge.className}`}>{roleBadge.label}</span>
            <h1 className="mt-2 truncate font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{userProfile.fullName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-indigo-100">
              <span className="inline-flex items-center gap-1.5"><Mail size={14} aria-hidden="true" />{user.email}</span>
              {userProfile.school && <span className="inline-flex items-center gap-1.5"><School size={14} aria-hidden="true" />{userProfile.school}{!isTeacher && userProfile.class ? ` · ${userProfile.class}` : ""}</span>}
            </p>
            {userProfile.avatarUrl && !avatarBusy && (
              <button type="button" onClick={() => void removeAvatar()} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-100 underline-offset-2 hover:underline">
                <Trash2 size={12} aria-hidden="true" />Dùng lại ảnh Google
              </button>
            )}
            {avatarError && <p role="alert" className="mt-2 text-xs font-semibold text-amber-200">{avatarError}</p>}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Mục tài khoản" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => selectTab(id)}
                className={`inline-flex h-11 shrink-0 items-center gap-2.5 rounded-xl px-3.5 text-sm font-semibold transition lg:w-full ${active ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-200" : "text-gray-600 hover:bg-white/70 hover:text-gray-900"}`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white" : "bg-gray-100 text-gray-500"}`}><Icon size={15} aria-hidden="true" /></span>
                {label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {tab === "profile" && (
            <form onSubmit={saveProfile}>
              <Panel title="Thông tin cá nhân" description={isTeacher ? "Học sinh tìm giáo viên theo họ tên hoặc số điện thoại này." : "Giáo viên nhận ra bạn qua họ tên, trường và lớp."}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Họ và tên" htmlFor="account-name" className="sm:col-span-2">
                    <input id="account-name" required maxLength={120} value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} className={`${inputClass} h-11`} autoComplete="name" />
                  </Field>
                  <Field label="Trường" htmlFor="account-school">
                    <input id="account-school" required maxLength={200} value={profile.school} onChange={(event) => setProfile({ ...profile, school: event.target.value })} className={`${inputClass} h-11`} autoComplete="organization" />
                  </Field>
                  {isTeacher ? (
                    <Field label="Số điện thoại" htmlFor="account-phone" hint="Bắt buộc với giáo viên để học sinh tìm thấy bạn.">
                      <input id="account-phone" required type="tel" inputMode="tel" value={profile.phoneNumber} onChange={(event) => setProfile({ ...profile, phoneNumber: event.target.value })} className={`${inputClass} h-11`} autoComplete="tel" placeholder="0901234567" />
                    </Field>
                  ) : (
                    <Field label="Lớp" htmlFor="account-class">
                      <input id="account-class" required maxLength={80} value={profile.className} onChange={(event) => setProfile({ ...profile, className: event.target.value })} className={`${inputClass} h-11`} placeholder="12A1" />
                    </Field>
                  )}
                  {!isTeacher && (
                    <Field label="Số điện thoại" optional htmlFor="account-phone">
                      <input id="account-phone" type="tel" inputMode="tel" value={profile.phoneNumber} onChange={(event) => setProfile({ ...profile, phoneNumber: event.target.value })} className={`${inputClass} h-11`} autoComplete="tel" placeholder="0901234567" />
                    </Field>
                  )}
                  <Field label="Email đăng nhập" htmlFor="account-email" hint="Email gắn với tài khoản Google, không đổi được.">
                    <input id="account-email" readOnly value={user.email ?? ""} className={`${inputClass.replace("bg-white", "bg-gray-50").replace("text-gray-900", "text-gray-500")} h-11 cursor-default`} />
                  </Field>
                </div>
                <SaveBar dirty={profileDirty} saving={profileSaving} message={profileMessage} onReset={() => { setProfile(initialProfile); setProfileMessage(null); }} />
              </Panel>
            </form>
          )}

          {tab === "study" && (
            <form onSubmit={saveSettings}>
              <Panel title={isTeacher ? "Hiển thị đề" : "Học tập"} description="Áp dụng trên mọi thiết bị bạn đăng nhập.">
                <div className="space-y-7">
                  <div>
                    <SubHeading>Cỡ chữ nội dung đề</SubHeading>
                    <div role="radiogroup" aria-label="Cỡ chữ nội dung đề" className="grid grid-cols-3 gap-2">
                      {([["sm", "Nhỏ"], ["md", "Vừa"], ["lg", "Lớn"]] as Array<[ExamFontScale, string]>).map(([value, label]) => {
                        const active = settings.examFontScale === value;
                        return (
                          <button key={value} type="button" role="radio" aria-checked={active} onClick={() => setSettings({ ...settings, examFontScale: value })} className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-sm font-semibold transition ${active ? "border-brand-400 bg-brand-50/70 text-brand-800 ring-4 ring-brand-500/10" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>
                            <span className="font-display" style={{ fontSize: `${EXAM_FONT_SCALE[value]}rem` }}>Aa</span>
                            <span className="text-[11px] font-medium text-gray-500">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Xem trước</p>
                      <p className="exam-reading mt-1 text-gray-900" style={{ ["--exam-scale" as string]: EXAM_FONT_SCALE[settings.examFontScale] }}>
                        Câu 1. Cho hàm số y = x³ − 3x + 2. Hàm số đạt cực đại tại điểm nào?
                      </p>
                    </div>
                  </div>
                  {!isTeacher && (
                    <div>
                      <SubHeading>Riêng tư và thông báo</SubHeading>
                      <div className="grid gap-3">
                        <Toggle checked={settings.hideOnLeaderboard} onChange={(checked) => setSettings({ ...settings, hideOnLeaderboard: checked })} label="Ẩn tên trên bảng xếp hạng lớp" description="Bạn cùng lớp thấy “Bạn học ẩn danh”. Giáo viên vẫn thấy tên bạn." />
                        <Toggle checked={settings.resultEmail} onChange={(checked) => setSettings({ ...settings, resultEmail: checked })} label="Gửi kết quả qua email sau khi nộp bài" description={`Gửi tới ${user.email}.`} />
                      </div>
                    </div>
                  )}
                </div>
                <SaveBar dirty={settingsDirty} saving={settingsSaving} message={settingsMessage} onReset={() => { setSettings(saved); setSettingsMessage(null); }} />
              </Panel>
            </form>
          )}

          {tab === "teaching" && isMod && (
            <form onSubmit={saveSettings}>
              <Panel title="Mặc định khi tạo đề" description="Trang Tạo bài thi điền sẵn các giá trị này; bạn vẫn sửa được từng đề.">
                <div className="space-y-7">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Phân loại" htmlFor="default-grade">
                      <SelectMenu id="default-grade" value={settings.examDefaults.gradeLevel} options={GRADE_LEVELS} onChange={(value) => setDefaults({ gradeLevel: value })} />
                    </Field>
                    <Field label="Loại đề" htmlFor="default-type">
                      <SelectMenu id="default-type" value={settings.examDefaults.examType} options={EXAM_TYPES} onChange={(value) => setDefaults({ examType: value })} />
                    </Field>
                    <Field label="Thời gian làm bài" htmlFor="default-duration">
                      <NumberField id="default-duration" value={settings.examDefaults.duration} onChange={(value) => setDefaults({ duration: value })} min={1} max={600} step={5} unit="phút" parse={(raw) => Number.parseInt(raw, 10)} fallback={1} />
                    </Field>
                    <Field label="Số lần làm tối đa" htmlFor="default-retries" hint="0 = không giới hạn.">
                      <NumberField id="default-retries" value={settings.examDefaults.maxRetries} onChange={(value) => setDefaults({ maxRetries: value })} min={0} max={100} unit="lần" parse={(raw) => Number.parseInt(raw, 10)} />
                    </Field>
                    <Field label="Điểm Phần I (trắc nghiệm)" htmlFor="default-p1">
                      <NumberField id="default-p1" value={settings.examDefaults.part1TotalScore} onChange={(value) => setDefaults({ part1TotalScore: value })} min={0} max={10} step={0.25} unit="điểm" />
                    </Field>
                    <Field label="Điểm Phần III (trả lời ngắn)" htmlFor="default-p3">
                      <NumberField id="default-p3" value={settings.examDefaults.part3TotalScore} onChange={(value) => setDefaults({ part3TotalScore: value })} min={0} max={10} step={0.25} unit="điểm" />
                    </Field>
                  </div>
                  <div>
                    <SubHeading>Ai được làm bài</SubHeading>
                    <ChoiceCards
                      name="Đối tượng mặc định"
                      value={settings.examDefaults.targetType}
                      onChange={(value) => setDefaults({ targetType: value })}
                      columns={3}
                      options={[
                        { value: "all", label: "Công khai", description: "Hiện ở kho đề", icon: Globe2 },
                        { value: "classes", label: "Chỉ lớp được giao", description: "Ẩn khỏi kho đề", icon: School },
                        { value: "both", label: "Công khai + giao lớp", description: "Cả hai", icon: Layers },
                      ]}
                    />
                  </div>
                  <Toggle checked={settings.examDefaults.isShared} onChange={(checked) => setDefaults({ isShared: checked })} label="Chia sẻ đề mới cho giáo viên khác" description="Giáo viên khác có thể xem và nhân bản đề." />
                </div>
                <SaveBar dirty={settingsDirty} saving={settingsSaving} message={settingsMessage} onReset={() => { setSettings(saved); setSettingsMessage(null); }} />
              </Panel>
            </form>
          )}

          {tab === "security" && (
            <Panel title="Đăng nhập và bảo mật" description="Tài khoản đăng nhập bằng Google, website không lưu mật khẩu của bạn.">
              <dl className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: Mail, label: "Tài khoản Google", value: user.email ?? "—" },
                  { icon: MonitorSmartphone, label: "Lần đăng nhập gần nhất", value: lastSignIn },
                  { icon: UserRound, label: "Ngày tạo tài khoản", value: createdAt },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-2xl bg-gray-50 p-4">
                    <dt className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Icon size={14} aria-hidden="true" />{label}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 rounded-2xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900">Đăng xuất khỏi mọi thiết bị</h3>
                <p className="mt-1 text-sm text-gray-500">Dùng khi bạn từng đăng nhập trên máy dùng chung hoặc làm mất điện thoại. Các thiết bị khác bị đăng xuất trong vòng 1 giờ.</p>
                {revokeMessage && <p role="status" className={`mt-3 text-sm font-semibold ${revokeMessage.ok ? "text-emerald-700" : "text-rose-700"}`}>{revokeMessage.text}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {confirmRevoke ? (
                    <>
                      <button type="button" disabled={revoking} onClick={() => void revokeSessions()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60">
                        {revoking && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}Xác nhận đăng xuất mọi thiết bị
                      </button>
                      <button type="button" onClick={() => setConfirmRevoke(false)} className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-gray-600 hover:bg-gray-100">Hủy</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmRevoke(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                      <MonitorSmartphone size={15} aria-hidden="true" />Đăng xuất mọi thiết bị
                    </button>
                  )}
                  <button type="button" onClick={logout} className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:border-gray-300">
                    <LogOut size={15} aria-hidden="true" />Đăng xuất thiết bị này
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
