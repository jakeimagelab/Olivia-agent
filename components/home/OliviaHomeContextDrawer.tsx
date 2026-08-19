"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronRight, Clapperboard, FileSignature, FileText, X } from "lucide-react";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";

type RecentWorkItem = {
  id: string;
  kind: "콘티" | "견적" | "계약";
  title: string;
  timestamp: string;
};

const recentIcon = { 콘티: Clapperboard, 견적: FileText, 계약: FileSignature } as const;

function recentHref(item: RecentWorkItem) {
  const resourceId = item.id.split(":").slice(1).join(":");
  if (item.kind === "콘티") return `/conti?id=${encodeURIComponent(resourceId)}`;
  if (item.kind === "계약") return `/contract?id=${encodeURIComponent(resourceId)}`;
  return `/quote?id=${encodeURIComponent(resourceId)}`;
}

function shortTimeLabel(value: string | null | undefined) {
  if (!value) return "오늘";
  return value.slice(0, 5);
}

export default function OliviaHomeContextDrawer({ onClose }: { onClose: () => void }) {
  const { data, state, savingTaskIds, setTaskCompleted } = useHomeDashboardData();
  const [recent, setRecent] = useState<RecentWorkItem[] | null>(null);
  const tasks = (data?.todayTasks ?? []).slice(0, 5);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard/recent-work", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => setRecent(Array.isArray(payload?.items) ? payload.items.slice(0, 5) : []))
      .catch((error) => {
        if ((error as Error)?.name !== "AbortError") setRecent([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <aside className="olivia-home-drawer" aria-label="오늘 할 일과 최근 작업">
      <section className="olivia-home-drawer__card">
        <header className="olivia-home-drawer__header">
          <div><h2>오늘의 할 일</h2><span>{tasks.length}</span></div>
          <button type="button" onClick={onClose} aria-label="홈 정보 패널 닫기"><X size={18} strokeWidth={1.7} /></button>
        </header>
        <div className="olivia-home-drawer__list">
          {state === "loading" ? <p className="olivia-home-drawer__empty">오늘 일정을 확인하고 있어요.</p> : null}
          {state !== "loading" && tasks.length === 0 ? <p className="olivia-home-drawer__empty">오늘 등록된 할 일이 없어요.</p> : null}
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className={`olivia-home-task${task.completed ? " is-complete" : ""}`}
              disabled={savingTaskIds.has(task.id)}
              onClick={() => void setTaskCompleted(task.id, !task.completed)}
            >
              <span className="olivia-home-task__check">{task.completed ? <Check size={11} /> : null}</span>
              <time>{shortTimeLabel(task.time)}</time>
              <span className="olivia-home-task__copy"><strong>{task.title}</strong><small>{task.completed ? "완료" : task.category || "진행 전"}</small></span>
            </button>
          ))}
        </div>
        <Link href="/calendar" className="olivia-home-drawer__footer-link">전체 일정 보기 <ChevronRight size={15} /></Link>
      </section>

      <section className="olivia-home-drawer__card">
        <header className="olivia-home-drawer__header">
          <div><h2>최근 작업</h2><span>{recent?.length ?? 0}</span></div>
        </header>
        <div className="olivia-home-drawer__list">
          {recent === null ? <p className="olivia-home-drawer__empty">최근 작업을 확인하고 있어요.</p> : null}
          {recent?.length === 0 ? <p className="olivia-home-drawer__empty">최근 작업이 없어요.</p> : null}
          {recent?.map((item) => {
            const Icon = recentIcon[item.kind];
            return (
              <Link key={item.id} href={recentHref(item)} className="olivia-home-recent">
                <span className={`olivia-home-recent__icon is-${item.kind}`}><Icon size={18} strokeWidth={1.6} /></span>
                <span><strong>{item.title}</strong><small>{item.kind} 작업</small></span>
                <ChevronRight size={14} strokeWidth={1.6} />
              </Link>
            );
          })}
        </div>
        <Link href="/clients" className="olivia-home-drawer__footer-link">전체 프로젝트 보기 <ChevronRight size={15} /></Link>
      </section>
      <span className="olivia-home-drawer__calendar-mark" aria-hidden="true"><CalendarDays size={16} /></span>
    </aside>
  );
}
