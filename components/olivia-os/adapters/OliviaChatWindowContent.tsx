"use client";

import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";

// Olivia를 일반 앱처럼 취급한다(스펙 변경 — 이전에는 useOliviaChatModeStore로 플로팅 패널을
// 토글하는 special-case였다). 이 창이 열려 있는 동안 우선순위 50짜리 dock을 등록해두면, 앱
// 전체에 단 하나뿐인 <OliviaConversation> 인스턴스(OliviaWorkspaceShell.tsx 소유)가 자동으로
// 이 창 안으로 portal된다 — 채팅 로직/상태를 복제하지 않는다. 창을 닫으면(store에서
// 제거=unmount) OliviaChatDockTarget의 cleanup이 돌면서 dock 등록도 자동 해제된다.
export function OliviaChatWindowContent() {
  return (
    <OliviaChatDockTarget id="desktop-os" priority={50} className="olivia-os-chat-dock" />
  );
}
