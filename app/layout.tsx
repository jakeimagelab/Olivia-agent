import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import RootExperienceShell from "@/components/layout/RootExperienceShell";
import "./globals.css";
import "./admin/admin.css";

const nanumSquare = localFont({
  src: "../lib/olivia/fonts/NanumSquare-Regular.ttf",
  variable: "--font-nanum-square",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://olivia.photoclinic.kr"),
  title: "포토클리닉 AI 에이전트",
  description: "포토클리닉 AI 에이전트 올리비아가 함께하는 병원 브랜딩·콘텐츠 운영 시스템입니다.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/assets/photoclinic-logo.png",
    shortcut: "/assets/photoclinic-logo.png",
    apple: [
      { url: "/assets/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "포토클리닉 AI 에이전트",
    description: "포토클리닉 AI 에이전트 올리비아가 함께하는 병원 브랜딩·콘텐츠 운영 시스템입니다.",
    siteName: "포토클리닉 AI 에이전트",
    images: ["/assets/photoclinic-logo.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&family=Nanum+Myeongjo:wght@400;700;800&family=Black+Han+Sans&family=Do+Hyeon&family=Gothic+A1:wght@400;700;900&family=Song+Myung&display=swap"
          rel="stylesheet"
        />
        {/* UI/UX 통일 개편 V2(2026-08-18) — 시안 지정 폰트. --font-sans 체인의 첫 순위로 넣고
            NanumSquare/Noto Sans KR은 폴백으로 남긴다(로드 실패해도 전체가 깨지지 않게). */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body className={`${nanumSquare.variable} min-h-screen font-sans antialiased`}>
        <RootExperienceShell>{children}</RootExperienceShell>
      </body>
    </html>
  );
}
