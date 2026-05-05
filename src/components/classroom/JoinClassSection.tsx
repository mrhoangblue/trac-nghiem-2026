"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { joinClass } from "@/lib/classroomService";

// Only valid class code characters (no O/I/0/1)
const VALID_CLASS_CODE_RE = /[^A-Z2-9]/g;

interface Props {
  user: User;
  /** Student's display name — falls back to displayName then email. */
  fullName: string;
}

export default function JoinClassSection({ user, fullName }: Props) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleCodeChange = (raw: string) => {
    const clean = raw.toUpperCase().replace(VALID_CLASS_CODE_RE, "").slice(0, 6);
    setCode(clean);
    if (result) setResult(null);
  };

  const handleJoin = async () => {
    if (code.length !== 6 || joining) return;
    setJoining(true);
    setResult(null);
    try {
      const res = await joinClass(code, {
        uid: user.uid,
        fullName,
        email: user.email ?? "",
      });
      if (res.success) {
        setResult({
          success: true,
          message: `Đã tham gia lớp "${res.className}" thành công! 🎉`,
        });
        setCode("");
      } else {
        const errorMessages: Record<string, string> = {
          NOT_FOUND: "Mã lớp không tồn tại. Kiểm tra lại mã và thử lại.",
          INACTIVE: "Lớp này đã đóng. Liên hệ giáo viên để biết thêm.",
          FULL: "Lớp đã đầy. Liên hệ giáo viên để được xét duyệt.",
          ALREADY_JOINED: "Bạn đã là thành viên của lớp này rồi.",
        };
        setResult({
          success: false,
          message: errorMessages[res.error ?? ""] ?? "Có lỗi xảy ra. Vui lòng thử lại.",
        });
      }
    } catch {
      setResult({ success: false, message: "Có lỗi xảy ra. Vui lòng thử lại sau." });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-xl shrink-0">
          🏫
        </div>
        <div>
          <h2 className="font-extrabold text-gray-900">Tham gia lớp học</h2>
          <p className="text-xs text-gray-500 mt-0.5">Nhập mã 6 ký tự do giáo viên cung cấp</p>
        </div>
      </div>

      {/* Input row */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="AB3C7X"
            maxLength={6}
            spellCheck={false}
            autoCapitalize="characters"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-2xl font-black tracking-[0.35em] text-gray-800 transition-colors placeholder:text-gray-300 placeholder:text-xl placeholder:tracking-widest"
          />
          {/* Progress dots */}
          {code.length > 0 && code.length < 6 && (
            <div className="absolute -bottom-5 left-0 right-0 flex justify-center gap-1">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i < code.length ? "bg-blue-500" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleJoin}
          disabled={code.length !== 6 || joining}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md text-sm whitespace-nowrap"
        >
          {joining ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Đang xử lý…
            </span>
          ) : (
            "Tham gia →"
          )}
        </button>
      </div>

      {/* Result message */}
      {result && (
        <div
          className={`mt-6 flex items-start gap-3 p-4 rounded-xl text-sm font-medium border ${
            result.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <span className="text-base shrink-0">{result.success ? "✅" : "❌"}</span>
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
}
