import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://olivia-agent-smoky.vercel.app"),
  title: "포토클리닉 AI 비서 관리자",
  description: "포토클리닉 관리자용 견적서 생성, 병원이미지 진단, 병원 채널 분석 통합 페이지입니다.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
