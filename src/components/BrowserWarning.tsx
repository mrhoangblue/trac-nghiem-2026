"use client";

import { useEffect, useState } from "react";

/**
 * In-app browser patterns that break Firebase Google Auth popup.
 * Facebook (FBAN/FBAV/FB_IAB), Instagram, Zalo, Line.
 */
const IN_APP_RE = /\b(FBAN|FBAV|FB_IAB|Instagram|ZaloApp|Zalo|Line)\b/i;

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return IN_APP_RE.test(navigator.userAgent);
}

export default function BrowserWarning({
  children,
}: {
  children: React.ReactNode;
}) {
  // Start false to match SSR — useEffect sets real value on client
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    setDetected(isInAppBrowser());
  }, []);

  if (!detected) {
    // eslint-disable-next-line react/jsx-no-useless-fragment
    return <>{children}</>;
  }

  // ── Full-screen blocking overlay ───────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white"
      style={{ padding: "2rem" }}
    >
      {/* Icon */}
      <div className="w-20 h-20 rounded-2xl bg-orange-50 border-2 border-orange-200 flex items-center justify-center text-4xl mb-6 shadow-sm">
        ⚠️
      </div>

      {/* Heading */}
      <h1
        className="text-2xl font-extrabold text-gray-900 text-center mb-3"
        style={{ lineHeight: 1.35 }}
      >
        Trình duyệt không được hỗ trợ
      </h1>

      {/* Main message */}
      <p className="text-gray-600 text-center text-base leading-relaxed mb-8 max-w-sm">
        Vui lòng mở trang web bằng{" "}
        <strong className="text-blue-600">Safari</strong> hoặc{" "}
        <strong className="text-blue-600">Chrome</strong> để hệ thống hoạt động
        ổn định nhất.
      </p>

      {/* Steps */}
      <div className="w-full max-w-sm bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-4">
        <p className="text-sm font-extrabold text-gray-700 uppercase tracking-wide">
          Hướng dẫn mở bằng trình duyệt ngoài:
        </p>

        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
            1
          </span>
          <p className="text-sm text-gray-700 leading-relaxed">
            Bấm vào biểu tượng{" "}
            <span className="font-bold">3 chấm (⋯)</span> hoặc{" "}
            <span className="font-bold">dấu chia sẻ (⎙)</span> ở góc phải màn
            hình.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
            2
          </span>
          <p className="text-sm text-gray-700 leading-relaxed">
            Chọn{" "}
            <span className="font-bold text-blue-600">
              &ldquo;Mở bằng trình duyệt&rdquo;
            </span>{" "}
            hoặc{" "}
            <span className="font-bold text-blue-600">
              &ldquo;Open in Safari / Chrome&rdquo;
            </span>
            .
          </p>
        </div>

        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
            3
          </span>
          <p className="text-sm text-gray-700 leading-relaxed">
            Trang web sẽ mở lại bình thường trong trình duyệt đã cài sẵn trên
            máy của bạn.
          </p>
        </div>
      </div>

      {/* URL copy hint */}
      <p className="mt-6 text-xs text-gray-400 text-center max-w-xs leading-relaxed">
        Hoặc sao chép đường dẫn trên thanh địa chỉ rồi dán vào Safari / Chrome.
      </p>
    </div>
  );
}
