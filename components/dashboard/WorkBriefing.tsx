"use client";

import Link from "next/link";
import { AlertCircle, BriefcaseBusiness, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyBriefingState from "@/components/dashboard/EmptyBriefingState";
import WorkBriefingItem from "@/components/dashboard/WorkBriefingItem";
import {
  buildWorkBriefingItems,
  type WorkBriefingFilter,
  type WorkBriefingItem as WorkItem,
} from "@/lib/dashboardBriefing";

const FILTERS: { value: WorkBriefingFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "hospital", label: "병원 업무" },
  { value: "todo", label: "내 할 일" },
];

export default function WorkBriefing() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [filter, setFilter] = useState<WorkBriefingFilter>("all");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const [dashboardResponse, workflowResponse] = await Promise.all([
        fetch("/api/dashboard", { cache: "no-store" }),
        fetch("/api/workflow/summary", { cache: "no-store" }),
      ]);
      if (!dashboardResponse.ok || !workflowResponse.ok) throw new Error("업무 데이터를 불러오지 못했습니다.");
      const [dashboard, workflow] = await Promise.all([dashboardResponse.json(), workflowResponse.json()]);
      if (!dashboard?.ok || !Array.isArray(workflow?.workflowRuns)) throw new Error("업무 데이터를 불러오지 못했습니다.");
      setItems(buildWorkBriefingItems(dashboard.todayTasks ?? [], workflow.workflowRuns ?? []));
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "업무 데이터를 불러오지 못했습니다.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("calendar-task-changed", refresh);
    return () => window.removeEventListener("calendar-task-changed", refresh);
  }, [load]);

  const visibleItems = useMemo(
    () => items.filter((item) => filter === "all" || item.kind === filter).slice(0, 5),
    [filter, items],
  );
  const filteredCount = items.filter((item) => filter === "all" || item.kind === filter).length;

  async function complete(item: WorkItem) {
    const taskId = item.id.replace(/^todo:/, "");
    if (savingIds.has(taskId)) return;
    setSavingIds((current) => new Set(current).add(taskId));
    setError("");
    try {
      const response = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, completed: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || "완료 상태를 저장하지 못했습니다.");
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      window.dispatchEvent(new CustomEvent("calendar-task-changed", { detail: { id: taskId, completed: true } }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "완료 상태를 저장하지 못했습니다.");
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }

  return (
    <section className="home-briefing-panel home-work-briefing" id="work-briefing" aria-labelledby="work-briefing-title">
      <header className="home-briefing-panel__head">
        <div>
          <span className="home-briefing-panel__eyebrow"><BriefcaseBusiness size={14}/> TODAY&apos;S WORK</span>
          <h2 id="work-briefing-title">업무 브리핑</h2>
          <p>오늘 확인하거나 처리해야 할 업무입니다.</p>
        </div>
        <Link href="/workflow/tasks">전체 업무 보기</Link>
      </header>

      <div className="home-briefing-filters" aria-label="업무 유형 필터">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={filter === option.value ? "is-active" : undefined}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {state === "loading" ? (
        <div className="home-briefing-loading" role="status"><span/><span/><span/></div>
      ) : state === "error" ? (
        <div className="home-briefing-error" role="alert">
          <AlertCircle size={16}/><span>{error}</span>
          <button type="button" onClick={() => void load()}><RefreshCw size={13}/>다시 불러오기</button>
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyBriefingState/>
      ) : (
        <div className="home-work-list">
          {visibleItems.map((item) => (
            <WorkBriefingItem
              key={item.id}
              item={item}
              saving={savingIds.has(item.id.replace(/^todo:/, ""))}
              onComplete={(target) => void complete(target)}
            />
          ))}
        </div>
      )}

      {state === "ready" && filteredCount > 5 ? (
        <Link className="home-briefing-more" href="/workflow/tasks">나머지 {filteredCount - 5}개 업무 보기</Link>
      ) : null}
      {error && state !== "error" ? <p className="home-briefing-inline-error" role="alert">{error}</p> : null}
    </section>
  );
}
