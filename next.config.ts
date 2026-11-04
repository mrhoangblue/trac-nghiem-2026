import type { NextConfig } from "next";

// Header bảo mật áp cho mọi trang. CSP chỉ khai báo các chỉ thị không ảnh hưởng tới
// script/style (KaTeX, TikZ, Firebase Auth popup) nên không làm vỡ trang hiện có;
// script-src/style-src để dành cho đợt siết riêng khi đã đo được nguồn tải thực tế.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // 1. Mở cửa cho địa chỉ IP của máy tính (Chữa bệnh quay vòng vòng)
  allowedDevOrigins: ['172.20.10.5'],

  // 2. Tắt built-in Next.js dev tools panel — thay bằng custom DevPanel (role-aware)
  devIndicators: false,

  // 2. Cấp phép hiển thị ảnh từ Firebase và Google (Chữa bệnh mất hình lúc nãy)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;
