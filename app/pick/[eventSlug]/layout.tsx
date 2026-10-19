import type { Viewport } from "next";

export const preferredRegion = ["icn1"];

// 사진을 판단하는 공개 화면은 확대가 필요하다. 앱 전체의 고정 배율은 이 경로에 적용하지 않는다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#FDFCFA",
};

export default function PickLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
