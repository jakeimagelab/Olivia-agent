"use client";

import { useEffect, useRef, useState } from "react";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";

// 스토어엔 idle/thinking/working/done/attention 같은 세분화된 agentStatus enum이 없다 —
// isStreaming으로 idle/working만 구분하고, 스트리밍이 막 끝난 순간만 "done" 글로우를 잠깐
// 흉내낸다(로컬 타이머). attention(주황 점)은 채팅이 최소화된 상태에서 새 메시지가 온 경우다.
export default function OliviaCore({ isStreaming, hasUnread, size = 18 }: { isStreaming: boolean; hasUnread?: boolean; size?: number }) {
  const [justFinished, setJustFinished] = useState(false);
  const wasStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setJustFinished(true);
      const timer = setTimeout(() => setJustFinished(false), 1500);
      wasStreamingRef.current = isStreaming;
      return () => clearTimeout(timer);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // is-thinking은 기존 olivia-core-mark CSS(admin.css)에 이미 있는 회전 링 애니메이션 —
  // 헤더의 다른 OliviaConversation 마크와 동일한 시각 언어를 쓴다.
  const stateClass = isStreaming ? "is-thinking" : justFinished ? "is-done" : "is-idle";

  return (
    <span className={`olivia-core-mark ${stateClass}`}>
      <OliviaIcon size={size} />
      {hasUnread ? <span className="olivia-core-mark__dot" aria-hidden="true" /> : null}
    </span>
  );
}
