"use client";

import { useEffect, useState } from "react";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";

// 스토어엔 idle/thinking/working/done/attention 같은 세분화된 agentStatus enum이 없다 —
// isStreaming으로 idle/working만 구분하고, 스트리밍이 막 끝난 순간만 "done" 글로우를 잠깐
// 흉내낸다(로컬 타이머). attention(주황 점)은 채팅이 최소화된 상태에서 새 메시지가 온 경우다.
export default function OliviaCore({ isStreaming, hasUnread, size = 18 }: { isStreaming: boolean; hasUnread?: boolean; size?: number }) {
  const [justFinished, setJustFinished] = useState(false);
  const wasStreamingRef = usePrevious(isStreaming);

  useEffect(() => {
    if (wasStreamingRef && !isStreaming) {
      setJustFinished(true);
      const timer = setTimeout(() => setJustFinished(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, wasStreamingRef]);

  const state = isStreaming ? "working" : justFinished ? "done" : "idle";

  return (
    <span className={`olivia-core-mark olivia-core-mark--${state}`}>
      <OliviaIcon size={size} />
      {hasUnread ? <span className="olivia-core-mark__dot" aria-hidden="true" /> : null}
    </span>
  );
}

function usePrevious<T>(value: T): T {
  const ref = useState<{ current: T }>(() => ({ current: value }))[0];
  const previous = ref.current;
  ref.current = value;
  return previous;
}
