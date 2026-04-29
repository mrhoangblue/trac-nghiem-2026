import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Sidebar from "@/components/Sidebar";
import BrowserWarning from "@/components/BrowserWarning";
import { AuthProvider } from "@/lib/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head></head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <BrowserWarning>
        <AuthProvider>
          <Header />
          <div className="flex flex-1 min-h-0">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0">
              {children}
            </main>
          </div>
          <Footer />
        </AuthProvider>
        </BrowserWarning>
      </body>
    </html>
  );
}
