import { SITE_URL } from "@/lib/seo";
import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono, STIX_Two_Text } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "katex/dist/katex.min.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Sidebar from "@/components/Sidebar";
import BrowserWarning from "@/components/BrowserWarning";
import DevPanel from "@/components/DevPanel";
import { AuthProvider } from "@/lib/AuthContext";
import { StudentModeProvider } from "@/lib/StudentModeContext";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const stixTwoText = STIX_Two_Text({
  variable: "--font-stix-two-text",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Học Toán THPT cùng Thầy Hoàng Blue", template: "%s | Thầy Hoàng Blue" },
  description: "Học Toán lớp 10, 11, 12 cùng Thầy Hoàng Blue. Luyện đề, học theo lớp, xem lời giải và theo dõi tiến bộ để chuẩn bị cho kỳ thi tốt nghiệp THPT.",
  openGraph: { siteName: "Toán Thầy Hoàng Blue", locale: "vi_VN", type: "website", title: "Học Toán THPT cùng Thầy Hoàng Blue", description: "Luyện đề, học theo lớp và theo dõi tiến bộ môn Toán THPT." },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      data-scroll-behavior="smooth"
      className={`${beVietnam.variable} ${geistMono.variable} ${stixTwoText.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link">Đến nội dung chính</a>
        <BrowserWarning>
        <AuthProvider>
          <StudentModeProvider>
          <Header />
          <div className="flex flex-1 min-h-0">
            <Sidebar />
            <main id="main-content" className="app-main flex-1 flex flex-col min-w-0">
              {children}
            </main>
          </div>
          <Footer />
          <DevPanel />
          </StudentModeProvider>
        </AuthProvider>
        </BrowserWarning>
        <Script
          id="browser-extension-hydration-guard"
          src="/browser-extension-hydration-guard.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
