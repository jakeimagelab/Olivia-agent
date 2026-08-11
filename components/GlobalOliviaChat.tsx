"use client";

import { usePathname } from "next/navigation";
import OliviaChat from "@/components/OliviaChat";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

// 홈(/admin/dashboard/home)은 자체 큰 임베드 채팅(OliviaHeroChat)을 쓰므로 플로팅 위젯을 겹쳐
// 띄우지 않는다 — 두 채팅 다 같은 /api/olivia 대화 스레드를 공유하니 데이터가 갈리진 않는다.
// 다만 홈에서 워크스페이스를 전체화면으로 열면(DynamicWorkspace가 body로 포털돼 히어로챗까지
// 덮어버리므로) 그 순간만은 플로팅 버튼을 다시 보여준다 — 이 store는 루트 레이아웃(페이지
// 트리 바깥)에서도 읽어야 해서 Zustand를 쓴다.
const localContextPages = ["/photoclinic", "/client-portal", "/admin/dashboard/home"];

export default function GlobalOliviaChat() {
  const pathname = usePathname();
  const isFullscreenWorkspace = useWorkspaceStore((s) => s.mode === "fullscreen");
  const hasLocalOlivia = localContextPages.some((path) => pathname?.startsWith(path)) && !isFullscreenWorkspace;

  if (hasLocalOlivia) return null;

  return <OliviaChat pageContext="월간 포토클리닉 구독 콘텐츠 운영 시스템" />;
}
