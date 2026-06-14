import type { Metadata } from "next";
import GlobalOliviaChat from "@/components/GlobalOliviaChat";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://olivia-agent-smoky.vercel.app"),
  title: "포토클리닉 구독 콘텐츠 운영",
  description: "월간 포토클리닉 구독 병원의 홍보 콘텐츠 운영 시스템입니다.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <GlobalOliviaChat />
      </body>
    </html>
  );
}
