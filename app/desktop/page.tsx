import type { Metadata } from "next";
import OliviaDesktop from "@/components/olivia-os/OliviaDesktop";

export const metadata: Metadata = {
  title: "Olivia OS · Desktop",
};

// OLIVIA OS Phase 1 진입 route. 기존 /clients, /calendar, /photo-sorting 등은 전혀 건드리지
// 않는다 — 여기서 그 기존 컴포넌트들을 창(AppWindow) 안에 마운트해서 재사용할 뿐이다.
export default function DesktopPage() {
  return <OliviaDesktop />;
}
