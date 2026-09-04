"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, Clock3, History, RefreshCw } from "lucide-react";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import styles from "./OliviaDesktop.module.css";

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1_440)}일 전`;
}

function WidgetFrame({ icon, title, action, children }: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.desktopWidget} aria-label={title}>
      <header className={styles.widgetHeader}>
        <span className={styles.widgetTitleIcon}>{icon}</span>
        <h2>{title}</h2>
        {action ? <span className={styles.widgetAction}>{action}</span> : null}
      </header>
      <div className={styles.widgetBody}>{children}</div>
    </section>
  );
}

export function DesktopWidgets() {
  const { data, state } = useHomeDashboardData();
  const openApp = useOliviaDesktopStore((store) => store.openApp);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  const loadActivities = useCallback(() => {
    let active = true;
    setActivitiesLoading(true);
    fetch("/api/admin/recent-activity", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.ok) setActivities(payload.items ?? []);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setActivitiesLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const cleanup = loadActivities();
    return cleanup;
  }, [loadActivities]);

  const openCalendar = () => {
    const app = getOliviaApp("calendar");
    if (app) openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height });
  };

  const schedule = data?.todayTasks.slice(0, 4) ?? [];
  const tasks = data?.workspaceTodayTasks?.slice(0, 4) ?? [];
  const loading = state === "loading";

  return (
    <aside className={styles.leftRail} aria-label="오늘의 업무 요약">
      <WidgetFrame
        icon={<CalendarDays size={14} />}
        title="오늘 일정"
        action={<button type="button" onClick={openCalendar}>전체보기</button>}
      >
        {loading ? <p className={styles.widgetEmpty}>일정을 불러오는 중…</p> : null}
        {!loading && schedule.length === 0 ? <p className={styles.widgetEmpty}>오늘 예정된 일정이 없습니다.</p> : null}
        {schedule.map((item) => (
          <button type="button" className={styles.scheduleRow} key={item.id} onClick={openCalendar}>
            <time>{item.time?.slice(0, 5) || "종일"}</time>
            <span>
              <strong>{item.title}</strong>
              <small>{[item.category, item.location].filter(Boolean).join(" · ") || "일정"}</small>
            </span>
          </button>
        ))}
      </WidgetFrame>

      <WidgetFrame
        icon={<CheckCircle2 size={14} />}
        title="오늘 할 일"
        action={<button type="button" onClick={openCalendar}>열기</button>}
      >
        {loading ? <p className={styles.widgetEmpty}>할 일을 불러오는 중…</p> : null}
        {!loading && tasks.length === 0 ? <p className={styles.widgetEmpty}>오늘 마감할 일이 없습니다.</p> : null}
        {tasks.map((item) => (
          <button type="button" className={styles.taskRow} key={item.id} onClick={openCalendar}>
            <span className={styles.taskStatus} aria-hidden="true" />
            <span>
              <strong>{item.title}</strong>
              <small>{item.checklistProgress ? `${item.checklistProgress.done}/${item.checklistProgress.total} 완료` : "진행 중"}</small>
            </span>
          </button>
        ))}
      </WidgetFrame>

      <WidgetFrame
        icon={<History size={14} />}
        title="최근 작업"
        action={(
          <button type="button" onClick={() => { loadActivities(); }} aria-label="최근 작업 새로고침" disabled={activitiesLoading}>
            <RefreshCw size={12} className={activitiesLoading ? styles.spinning : undefined} />
          </button>
        )}
      >
        {activitiesLoading ? <p className={styles.widgetEmpty}>최근 작업을 불러오는 중…</p> : null}
        {!activitiesLoading && activities.length === 0 ? <p className={styles.widgetEmpty}>최근 작업 기록이 없습니다.</p> : null}
        {activities.slice(0, 4).map((item) => (
          <article className={styles.activityRow} key={item.id}>
            <span className={styles.activityIcon}><Clock3 size={11} /></span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <time>{relativeTime(item.createdAt)}</time>
          </article>
        ))}
      </WidgetFrame>
    </aside>
  );
}
