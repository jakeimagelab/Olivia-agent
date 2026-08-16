"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import OliviaCore from "@/components/olivia/OliviaCore";
import { messageText } from "@/lib/olivia/v2/types";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { useOliviaChatModeStore } from "@/lib/store/useOliviaChatModeStore";

// 최소화된 60px rail. 완전히 복원하지 않아도 최근 Olivia 답변을 확인할 수 있도록 hover 시
// 작은 미리보기(Quick Peek 미니 버전, 스펙 47번)를 보여준다 — 필수는 아니라 클릭 한 번으로도
// 충분히 대체 가능하지만 구현 난이도가 낮아 포함했다.
export default function OliviaChatDock() {
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);
  const agentStatus = useOliviaConversationStore((state) => state.agentStatus);
  const messages = useOliviaConversationStore((state) => state.messages);
  const hasUnread = useOliviaChatModeStore((state) => state.hasUnread);
  const restoreChat = useOliviaChatModeStore((state) => state.restoreChat);
  const [peeking, setPeeking] = useState(false);

  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const peekText = isStreaming ? (agentStatus || "답변 작성 중…") : (lastAssistantMessage ? messageText(lastAssistantMessage) : "");

  return (
    <div
      className="olivia-chat-dock"
      onMouseEnter={() => setPeeking(true)}
      onMouseLeave={() => setPeeking(false)}
    >
      <button type="button" className="olivia-chat-dock__expand" onClick={restoreChat} aria-label="Olivia 대화 펼치기">
        <ChevronLeft size={14} />
      </button>
      <OliviaCore isStreaming={isStreaming} hasUnread={hasUnread} size={20} />
      {peeking && peekText ? (
        <div className="olivia-chat-dock__peek">
          <strong>OLIVIA</strong>
          <p>{peekText}</p>
        </div>
      ) : null}
    </div>
  );
}
