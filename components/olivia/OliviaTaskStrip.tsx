"use client";

import { useEffect, useState } from "react";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";

type TaskSessionSummary = {
  id: string;
  status: string;
  clientName: string;
  typeLabel: string;
  total: number;
  done: number;
  nextTitle: string | null;
};

// 60절 크기 제약: "히어산부인과 · 촬영 준비 · 3/5 완료 · 다음: 장비 체크" 한 줄 + [계속] 버튼만.
// activeTaskSessionId가 없으면 아예 렌더링하지 않는다(대화 시작/새 대화 시 자동으로 사라짐).
export default function OliviaTaskStrip() {
  const activeTaskSessionId = useOliviaConversationStore((state) => state.activeTaskSessionId);
  const sendMessage = useOliviaConversationStore((state) => state.sendMessage);
  const isSending = useOliviaConversationStore((state) => state.isSending);
  const [summary, setSummary] = useState<TaskSessionSummary | null>(null);

  useEffect(() => {
    if (!activeTaskSessionId) { setSummary(null); return; }
    let cancelled = false;
    fetch(`/api/olivia/task-sessions/${activeTaskSessionId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.ok) setSummary(d.session); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTaskSessionId]);

  if (!activeTaskSessionId || !summary || summary.status !== "active") return null;

  return (
    <div className="olivia-task-strip">
      <span className="olivia-task-strip__text">
        <strong>{summary.clientName}</strong> · {summary.typeLabel} · {summary.done}/{summary.total} 완료
        {summary.nextTitle ? <> · 다음: {summary.nextTitle}</> : null}
      </span>
      {summary.nextTitle ? (
        <button type="button" disabled={isSending} onClick={() => void sendMessage("계속하자")}>
          계속
        </button>
      ) : null}
    </div>
  );
}
