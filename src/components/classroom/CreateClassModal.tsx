"use client";

import { useState } from "react";
import { createClass } from "@/lib/classroomService";

interface Props {
  teacherId: string;
  teacherName: string;
  onClose: () => void;
  /** Called after the class is successfully created. */
  onCreated: (result: { classId: string; classCode: string; name: string }) => void;
}

export default function CreateClassModal({ teacherId, teacherName, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxStudents, setMaxStudents] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ classId: string; classCode: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Vui lòng nhập tên lớp."); return; }
    setCreating(true);
    setError("");
    try {
      const result = await createClass({
        name: name.trim(),
        description: description.trim(),
        teacherId,
        teacherName,
        maxStudents: maxStudents ? parseInt(maxStudents, 10) : undefined,
      });
      const payload = { ...result, name: name.trim() };
      setCreated(payload);
      onCreated(payload);
    } catch {
      setError("Có lỗi xảy ra khi tạo lớp. Vui lòng thử lại.");
    } finally {
      setCreating(false);
    }
  };

  const copyCode = () => {
    if (!created) return;
    navigator.clipboard.writeText(created.classCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-5 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Tạo lớp học mới</h2>
            <p className="text-sm opacity-70 mt-0.5">Mã lớp sẽ được tạo tự động</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label="Đóng"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {created ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-extrabold text-gray-900 mb-1">Lớp đã được tạo!</h3>
            <p className="text-gray-500 text-sm mb-6">Chia sẻ mã này với học sinh của bạn</p>

            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-2xl px-6 py-6 mb-6">
              <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest mb-2">Mã lớp học</p>
              <p className="text-5xl font-black tracking-[0.35em] text-indigo-700 font-mono select-all">
                {created.classCode}
              </p>
              <p className="text-sm text-gray-600 font-semibold mt-3">{created.name}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={copyCode}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                  copied
                    ? "bg-emerald-500 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {copied ? "✓ Đã sao chép!" : "📋 Sao chép mã"}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        ) : (
          /* ── Form state ────────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Class name */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Tên lớp học <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Toán 12A1, Lý 11B…"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none transition-colors text-sm"
                maxLength={100}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Mô tả{" "}
                <span className="text-gray-400 font-normal">(tùy chọn)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả ngắn về lớp học, thời gian học, nội dung…"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none transition-colors text-sm resize-none"
                maxLength={500}
              />
            </div>

            {/* Max students */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Số học sinh tối đa{" "}
                <span className="text-gray-400 font-normal">(tùy chọn — để trống = không giới hạn)</span>
              </label>
              <input
                type="number"
                value={maxStudents}
                onChange={(e) => setMaxStudents(e.target.value)}
                placeholder="Ví dụ: 40"
                min={1}
                max={500}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none transition-colors text-sm"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <span>⚠️</span> {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {creating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang tạo…
                  </>
                ) : (
                  "Tạo lớp học →"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
