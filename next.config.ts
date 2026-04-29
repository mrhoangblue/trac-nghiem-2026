import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Mở cửa cho địa chỉ IP của máy tính (Chữa bệnh quay vòng vòng)
  allowedDevOrigins: ['172.20.10.5'],

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