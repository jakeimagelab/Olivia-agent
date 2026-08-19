"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import OliviaTaskStrip from "@/components/olivia/OliviaTaskStrip";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import { useOliviaChatModeStore } from "@/lib/store/useOliviaChatModeStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { registerOliviaRouter } from "@/lib/olivia/features/navigationBridge";

// 코드 요청서 — Olivia UX/Motion Core(2026-08-16). 예전 GlobalOliviaChat.tsx를 대체한다 —
// 홈 이외의 페이지에서는 데스크톱에서 본문과 폭을 나누는 호출형 패널로 동작한다.
// 모바일에서만 기존처럼 화면 위에 올라오는 drawer로 바뀐다.
// 홈(/admin/dashboard/home)은 자체 큰 임베드 채팅(useOliviaLayoutStore)을 쓰므로 여기서 제외한다 —
// 두 표면 다 같은 useOliviaConversationStore.messages를 구독하므로 대화 내용은 계속 같다.
const localContextPages = ["/photoclinic", "/client-portal", "/admin/dashboard/home"];

export default function OliviaPersistentChat() {
  const pathname = usePathname();
  const router = useRouter();
  const isFullscreenWorkspace = useWorkspaceStore((s) => s.mode === "fullscreen");
  const hasLocalOlivia = localContextPages.some((path) => pathname?.startsWith(path)) || isFullscreenWorkspace;

  // 이 컴포넌트는 루트 레이아웃에 항상 마운트되어 있으므로, 훅이 아닌 Olivia 기능 실행
  // 코드(executor.ts, actionRouter.ts)가 쓸 수 있는 유일한 useRouter() 출처가 된다.
  useEffect(() => { registerOliviaRouter(router); }, [router]);

  const chatMode = useOliviaChatModeStore((state) => state.chatMode);
  const minimizeChat = useOliviaChatModeStore((state) => state.minimizeChat);
  const toggleChat = useOliviaChatModeStore((state) => state.toggleChat);
  const markUnread = useOliviaChatModeStore((state) => state.markUnread);
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);
  const messageCount = useOliviaConversationStore((state) => state.messages.length);
  const wasStreamingRef = useRef(isStreaming);

  // 최소화된 상태에서 스트리밍이 끝나(=새 답변 도착) rail의 주황 점을 켠다.
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) markUnread();
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, messageCount, markUnread]);

  const isOpen = chatMode !== "minimized";
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") minimizeChat();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, minimizeChat]);

  if (hasLocalOlivia) return null;

  return (
    <>
      <button
        type="button"
        className={`olivia-floating-core olivia-floating-core--global${isOpen ? " is-open" : ""}`}
        onClick={toggleChat}
        aria-label={isOpen ? "Olivia 대화 닫기" : "Olivia 대화 열기"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={20} strokeWidth={1.8} /> : <OliviaIcon size={20} />}
      </button>
      <div className={`olivia-chat-drawer__scrim olivia-chat-drawer__scrim--persistent${isOpen ? " is-open" : ""}`} aria-hidden="true" onClick={minimizeChat} />
      {isOpen ? (
        <aside className="olivia-persistent-chat olivia-persistent-chat--split" aria-label="Olivia 대화">
          <OliviaTaskStrip />
          <OliviaConversation variant="drawer" />
        </aside>
      ) : null}
    </>
  );
}
