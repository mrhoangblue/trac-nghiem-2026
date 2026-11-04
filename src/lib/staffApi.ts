"use client";

import { auth } from "@/lib/firebase";

/** Gọi API cần đăng nhập bằng token của người dùng hiện tại; thử làm mới token một lần khi bị 401. */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const send = async (forceRefresh: boolean) => {
    const token = await auth.currentUser?.getIdToken(forceRefresh);
    if (!token) throw new Error("UNAUTHENTICATED");
    return fetch(input, {
      cache: "no-store",
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers, Authorization: `Bearer ${token}` },
    });
  };
  const response = await send(false);
  return response.status === 401 ? send(true) : response;
}

/** Số lượt làm theo từng đề; đề không có quyền xem sẽ vắng mặt trong kết quả. */
export async function fetchExamSubmissionCounts(examIds: string[]): Promise<Record<string, number>> {
  if (examIds.length === 0) return {};
  const merged: Record<string, number> = {};
  for (let offset = 0; offset < examIds.length; offset += 300) {
    const response = await authedFetch("/api/staff/exam-submission-counts", {
      method: "POST",
      body: JSON.stringify({ examIds: examIds.slice(offset, offset + 300) }),
    });
    if (!response.ok) continue;
    const payload = await response.json().catch(() => null) as { counts?: Record<string, number> } | null;
    Object.assign(merged, payload?.counts ?? {});
  }
  return merged;
}
