"use client";

import { usePathname } from "next/navigation";
import OliviaFloatingConversation from "@/components/olivia-v2/OliviaFloatingConversation";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

// 홈(/admin/dashboard/home)은 자체 큰 임베드 채팅을 쓰므로 플로팅 위젯을 겹쳐 띄우지 않는다.
// 두 표면은 DB 재조회가 아니라 같은 useOliviaConversationStore.messages 배열을 직접 구독한다.
// 다만 홈에서 워크스페이스를 전체화면으로 열면(DynamicWorkspace가 body로 포털돼 히어로챗까지
// 덮어버리므로) 그 순간만은 플로팅 버튼을 다시 보여준다 — 이 store는 루트 레이아웃(페이지
// 트리 바깥)에서도 읽어야 해서 Zustand를 쓴다.
const localContextPages = ["/photoclinic", "/client-portal", "/admin/dashboard/home"];

export default function GlobalOliviaChat() {
  const pathname = usePathname();
  const isFullscreenWorkspace = useWorkspaceStore((s) => s.mode === "fullscreen");
  const hasLocalOlivia = localContextPages.some((path) => pathname?.startsWith(path)) || isFullscreenWorkspace;

  if (hasLocalOlivia) return null;

  return <OliviaFloatingConversation />;
}
