"use client";

import { useCallback, useEffect, useState } from "react";
import OliviaChatWorkItemCard from "@/components/olivia/OliviaChatWorkItemCard";
import type { OliviaChatWorkItem, OliviaChatWorkItemAction } from "@/lib/olivia/chatTypes";

export default function OliviaMeetingPanel() {
  const [items, setItems] = useState<OliviaChatWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/olivia/meetings?days=2", { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setItems(data.meetings || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "미팅을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onAction = async (item: OliviaChatWorkItem, action: OliviaChatWorkItemAction) => {
    if (action === "view") {
      window.location.href = item.workflowRunId ? `/clients?workflowRunId=${encodeURIComponent(item.workflowRunId)}` : "/calendar";
      return;
    }
    const calendarTaskId = String(item.metadata?.calendarTaskId || (item.kind === "meeting" ? item.id : ""));
    setBusy(item.id);
    setMessage("");
    try {
      const response = await fetch("/api/olivia/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, calendarTaskId, memoId: item.kind === "memo" ? item.id : undefined, workflowRunId: item.workflowRunId }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setMessage(data.message || "처리했습니다.");
      if (Array.isArray(data.workItems) && data.workItems.length) setItems(data.workItems);
      else await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "미팅 작업을 처리하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="olivia-meeting-panel" aria-labelledby="olivia-meeting-title">
      <div className="olivia-meeting-panel__heading">
        <div><span>MEETING ASSISTANT</span><h2 id="olivia-meeting-title">오늘·내일 고객 미팅</h2></div>
        <button type="button" onClick={() => void load()}>새로고침</button>
      </div>
      {message && <p className="olivia-meeting-panel__message">{message}</p>}
      {loading ? <div className="olivia-empty">미팅 일정을 확인하고 있습니다.</div> : items.length ? (
        <div className="olivia-list-grid">{items.map((item) => <OliviaChatWorkItemCard key={`${item.kind}-${item.id}`} item={item} busy={busy === item.id} onAction={onAction}/>)}</div>
      ) : <div className="olivia-empty">오늘과 내일 예정된 고객 미팅이 없습니다.</div>}
    </section>
  );
}
