"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import OliviaWorkspaceShell from "@/components/olivia/OliviaWorkspaceShell";

const LegacyAppChrome = dynamic(() => import("./LegacyAppChrome"));

const OS_ROUTE_PATHS = new Set(["/", "/desktop", "/admin/dashboard/home"]);

export default function RootExperienceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // OS 루트는 사이드바/커서이펙트/스플래시 등 나머지 Legacy chrome은 다 건너뛰지만,
  // OliviaWorkspaceShell만은 항상 마운트돼야 한다 — 앱 전체에 단 하나뿐인 <OliviaConversation>
  // 인스턴스를 소유하는 곳이 여기라서, 이게 없으면 OLIVIA OS의 Olivia 창(olivia-chat, dock
  // priority로 portal을 가로채는 방식)이 등록만 되고 받아줄 대상이 없어 빈 화면이 된다.
  if (pathname && OS_ROUTE_PATHS.has(pathname)) {
    return <>{children}<OliviaWorkspaceShell /></>;
  }
  return <LegacyAppChrome>{children}</LegacyAppChrome>;
}
