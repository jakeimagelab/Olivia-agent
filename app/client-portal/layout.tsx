import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "포토클리닉 고객 포털",
  description: "포토클리닉 촬영 진행상황과 전달 자료를 확인하는 고객 전용 페이지입니다.",
};

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight:"100vh", background:"#F7F4EF", fontFamily:"'Pretendard','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif", color:"#1C2B28" }}>{children}</div>;
}
