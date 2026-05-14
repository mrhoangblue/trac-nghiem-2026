"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getClassById, joinClassById } from "@/lib/classroomService";
import type { ClassDoc } from "@/utils/classroomTypes";

const VALID_CLASS_CODE_RE = /[^A-Z2-9]/g;

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}

export default function JoinClassByLinkPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { user, userProfile, loading: authLoading } = useAuth();

  const [classData, setClassData] = useState<(ClassDoc & { id: string }) | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!classId) return;
    getClassById(classId)
      .then((data) => {
        if (!data || !data.isActive) setNotFound(true);
        else setClassData(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setPageLoading(false));
  }, [classId]);

  const handleCodeChange = (raw: string) => {
    const clean = raw.toUpperCase().replace(VALID_CLASS_CODE_RE, "").slice(0, 6);
    setCode(clean);
    if (result) setResult(null);
  };

  const handleJoin = async () => {
    if (!user || !userProfile || code.length !== 6 || joining) return;
    setJoining(true);
    setResult(null);
    try {
      const res = await joinClassById(classId, code, {
        uid: user.uid,
        fullName: userProfile.fullName,
        email: user.email ?? "",
      });
      if (res.success) {
        setResult({ success: true, message: `Đã tham gia lớp "${res.className}" thành công! 🎉` });
        setTimeout(() => router.push("/student/classes"), 1800);
      } else {
        const msgs: Record<string, string> = {
          NOT_FOUND: "Mã lớp không đúng. Kiểm tra lại mã giáo viên cung cấp.",
          INACTIVE: "Lớp này đã đóng. Liên hệ giáo viên để biết thêm.",
          FULL: "Lớp đã đầy. Liên hệ giáo viên để được xét duyệt.",
          ALREADY_JOINED: "Bạn đã là thành viên của lớp này rồi.",
        };
        setResult({ success: false, message: msgs[res.error ?? ""] ?? "Có lỗi xảy ra. Vui lòng thử lại." });
      }
    } catch {
      setResult({ success: false, message: "Có lỗi xảy ra. Vui lòng thử lại sau." });
    } finally {
      setJoining(false);
    }
  };

  if (authLoading || pageLoading) return <Spinner />;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">🔐</div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-2">Cần đăng nhập</h1>
          <p className="text-gray-500 text-sm mb-6">Bạn cần đăng nhập để tham gia lớp học.</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all"
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-2">Không tìm thấy lớp học</h1>
          <p className="text-gray-500 text-sm mb-6">
            Lớp học này không tồn tại hoặc đã đóng. Liên hệ giáo viên để được hỗ trợ.
          </p>
          <Link
            href="/student/classes"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all"
          >
            ← Quay lại
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-4">
            🏫
          </div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-1">
            Lớp học của {classData?.teacherName}
          </p>
          <h1 className="text-2xl font-extrabold text-gray-900">{classData?.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {classData?.studentIds.length ?? 0} học sinh đã tham gia
          </p>
        </div>

        {result?.success ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-5xl">🎉</div>
            <p className="text-emerald-700 font-bold text-center">{result.message}</p>
            <p className="text-gray-400 text-sm">Đang chuyển hướng…</p>
          </div>
        ) : (
          <>
            <div className="mb-2">
              <label className="block text-sm font-bold text-gray-700 mb-3 text-center">
                Nhập mã lớp (6 ký tự) do giáo viên cung cấp
              </label>
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
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-sm whitespace-nowrap"
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
            </div>

            {result && !result.success && (
              <div className="mt-6 flex items-start gap-3 p-4 rounded-xl text-sm font-medium border bg-red-50 border-red-200 text-red-700">
                <span className="text-base shrink-0">❌</span>
                <span>{result.message}</span>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <Link href="/student/classes" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                ← Quay lại danh sách lớp
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
