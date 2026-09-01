"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import OliviaAgentCenter from "@/components/olivia-agent-center/OliviaAgentCenter";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import { useOliviaChatModeStore } from "@/lib/store/useOliviaChatModeStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";

// Olivia Agent 2.0 Phase 1 — OliviaPersistentChat.tsx에서 순수 추출한 플로팅 토글+드로어.
// 워크스페이스로 등록되지 않은 일반 페이지(고객관리/일정 등)와 photo-sorting에서 쓴다. 어떤
// 페이지에서 이걸 보여줄지는 OliviaWorkspaceShell이 판단하고, 이 컴포넌트는 판단이 끝난 뒤의
// 렌더링만 담당한다 — 동작은 예전 OliviaPersistentChat과 동일하다.
export default function OliviaFloatingChatToggle() {
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
      <OliviaAgentCenter isOpen={isOpen} onClose={minimizeChat} onMinimize={minimizeChat} />
    </>
  );
}
