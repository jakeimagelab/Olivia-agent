"use client";

import Link from "next/link";
import { useState } from "react";
import OliviaPriorityBadge from "@/components/olivia/OliviaPriorityBadge";

export default function OliviaInsightCard({ insight, compact = false, onChanged }: { insight: any; compact?: boolean; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const mutate = async (action: "acknowledge" | "dismiss" | "snooze", body: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await fetch(`/api/olivia/insights/${insight.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      onChanged?.();
    } finally { setBusy(false); }
  };
  return (
    <article className={`olivia-insight-card${compact ? " is-compact" : ""}`}>
      <div className="olivia-card-top"><OliviaPriorityBadge score={insight.priority_score ?? 0}/><span>{insight.insight_type}</span></div>
      <h3>{insight.title}</h3>
      <p>{insight.summary}</p>
      {!compact && <div className="olivia-card-reason"><strong>왜 중요한가</strong><span>{insight.reason}</span></div>}
      <div className="olivia-card-meta">
        {insight.recommended_due_at ? <span>기한 {new Date(insight.recommended_due_at).toLocaleString("ko-KR")}</span> : <span>감지 {new Date(insight.detected_at).toLocaleDateString("ko-KR")}</span>}
        {insight.recommended_action && <b>준비: {insight.recommended_action}</b>}
      </div>
      <div className="olivia-card-actions">
        <Link href={`/olivia-assistant?insight=${insight.id}`}>내용 확인</Link>
        <button disabled={busy} onClick={() => mutate("acknowledge")}>확인</button>
        <button disabled={busy} onClick={() => mutate("snooze", { hours: 24 })}>내일 알림</button>
        <button disabled={busy} onClick={() => mutate("dismiss", { reason: "대시보드에서 무시" })}>무시</button>
      </div>
    </article>
  );
}
