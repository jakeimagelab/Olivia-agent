"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import OliviaWorkspaceShell from "@/components/olivia/OliviaWorkspaceShell";

const LegacyAppChrome = dynamic(() => import("./LegacyAppChrome"));

const OS_ROUTE_PATHS = new Set(["/", "/desktop", "/admin/dashboard/home"]);

export default function RootExperienceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    const isEmbedded = window.self !== window.top;
    setEmbedded(isEmbedded);
    // 전용 Window Adapter가 없는 레거시 페이지는 iframe(LegacyRouteWindowContent) 안에서도
    // 자기 GlobalHeader/mesh 배경을 그대로 그린다 — 페이지 126개를 각각 고치는 대신
    // <html>에 클래스를 붙이고 globals.css에서 .pc-header/.analyzer-header를 숨긴다.
    document.documentElement.classList.toggle("olivia-embedded", isEmbedded);
  }, []);

  // Desktop compatibility Window의 iframe 안에서는 기존 페이지의 기능 내용만 렌더한다.
  // Global sidebar/header와 두 번째 Olivia shell을 넣지 않아 OS chrome이 중복되지 않는다.
  if (embedded) return <>{children}</>;

  // OS 루트는 사이드바/커서이펙트/스플래시 등 나머지 Legacy chrome은 다 건너뛰지만,
  // OliviaWorkspaceShell만은 항상 마운트돼야 한다 — 앱 전체에 단 하나뿐인 <OliviaConversation>
  // 인스턴스를 소유하는 곳이 여기라서, 이게 없으면 OLIVIA OS의 Olivia AppWindow가
  // 등록만 되고 받아줄 대화 대상이 없어 빈 화면이 된다.
  if (pathname && OS_ROUTE_PATHS.has(pathname)) {
    return <>{children}<OliviaWorkspaceShell /></>;
  }
  return <LegacyAppChrome>{children}</LegacyAppChrome>;
}
