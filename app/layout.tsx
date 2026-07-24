import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import GlobalOliviaChat from "@/components/GlobalOliviaChat";
import GlobalClientContextBridge from "@/components/GlobalClientContextBridge";
import GlobalFeatureSidebar from "@/components/GlobalFeatureSidebar";
import CursorEffect from "@/components/CursorEffect";
import SplashScreen from "@/components/SplashScreen";
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
  title: "포토클리닉 구독 콘텐츠 운영",
  description: "월간 포토클리닉 구독 병원의 홍보 콘텐츠 운영 시스템입니다.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/assets/photoclinic-logo.png",
    shortcut: "/assets/photoclinic-logo.png",
    apple: [
      { url: "/assets/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
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
      </head>
      <body className={`${nanumSquare.variable} min-h-screen font-sans antialiased`}>
        <SplashScreen />
        <CursorEffect />
        <GlobalFeatureSidebar>
          <GlobalClientContextBridge />
          {children}
        </GlobalFeatureSidebar>
        <GlobalOliviaChat />
        <script dangerouslySetInnerHTML={{ __html: `
          document.addEventListener("click", function(e) {
            var btn = e.target.closest("button");
            if (!btn || btn.disabled) return;
            var rect = btn.getBoundingClientRect();
            var size = Math.max(rect.width, rect.height) * 2;
            var x = e.clientX - rect.left - size / 2;
            var y = e.clientY - rect.top - size / 2;
            var ripple = document.createElement("span");
            ripple.className = "pc-ripple";
            ripple.style.cssText = "width:" + size + "px;height:" + size + "px;left:" + x + "px;top:" + y + "px;";
            btn.appendChild(ripple);
            setTimeout(function() { ripple.remove(); }, 600);
          });
        `}} />
      </body>
    </html>
  );
}
