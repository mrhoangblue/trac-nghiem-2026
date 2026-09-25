import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Hệ thống Ôn tập Toán",
  description: "Website trắc nghiệm toán dành cho học sinh",
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
      suppressHydrationWarning
      className={`${beVietnam.variable} ${geistMono.variable} h-full antialiased`}
    >

      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">Đến nội dung chính</a>
        <BrowserWarning>
        <AuthProvider>
          <StudentModeProvider>
          <Header />
          <div className="flex flex-1 min-h-0">
            <Sidebar />
            <main id="main-content" className="flex-1 flex flex-col min-w-0">
              {children}
            </main>
          </div>
          <Footer />
          <DevPanel />
          </StudentModeProvider>
        </AuthProvider>
        </BrowserWarning>
      </body>
    </html>
  );
}
