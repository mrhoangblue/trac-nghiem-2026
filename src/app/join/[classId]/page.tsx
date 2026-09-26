"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getClassById, joinClassById } from "@/lib/classroomService";
import type { ClassDoc } from "@/utils/classroomTypes";

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}

export default function JoinClassByLinkPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [classData, setClassData] = useState<(ClassDoc & { id: string }) | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

  const handleJoin = async () => {
    if (!user || joining) return;
    setJoining(true);
    setResult(null);
    try {
      const res = await joinClassById(classId, await user.getIdToken());
      if (res.success) {
        setResult({ success: true, message: `Đã gửi yêu cầu vào lớp “${res.className}”. Giáo viên sẽ duyệt yêu cầu của bạn.` });
        setTimeout(() => router.push("/student/classes"), 1800);
      } else {
        const msgs: Record<string, string> = {
          NOT_FOUND: "Liên kết lớp không còn hợp lệ.",
          INACTIVE: "Lớp này đã đóng. Liên hệ giáo viên để biết thêm.",
          FULL: "Lớp đã đầy. Liên hệ giáo viên để được xét duyệt.",
          ALREADY_JOINED: "Bạn đã là thành viên của lớp này rồi.",
          ALREADY_PENDING: "Yêu cầu của bạn đang chờ giáo viên duyệt.",
          SUSPENDED: "Tài khoản của bạn đang bị tạm dừng trong lớp này.",
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
            className="inline-block px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all"
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
            className="inline-block px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all"
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
          <div className="w-16 h-16 bg-brand-100 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-4">
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success-100 text-2xl text-success-700">✓</div>
            <p className="text-success-700 font-bold text-center">{result.message}</p>
            <p className="text-gray-400 text-sm">Đang chuyển hướng…</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-center">
              <p className="text-sm leading-6 text-gray-600">
                Đây là liên kết mời trực tiếp. Sau khi gửi, yêu cầu sẽ xuất hiện trong danh sách chờ của giáo viên.
              </p>
              <button
                onClick={handleJoin}
                disabled={joining}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {joining && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {joining ? "Đang gửi…" : "Gửi yêu cầu tham gia"}
              </button>
            </div>

            {result && !result.success && (
              <div className="mt-6 flex items-start gap-3 p-4 rounded-xl text-sm font-medium border bg-danger-50 border-danger-200 text-danger-700">
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
