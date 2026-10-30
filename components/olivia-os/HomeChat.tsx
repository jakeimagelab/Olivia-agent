"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";
import type { StatusPanelData } from "@/lib/system-status/panelTypes";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import styles from "./OliviaDesktop.module.css";

type Gallery = {
  hospital_name?: string;
  shoot_date?: string;
  gallery_type?: string;
  publication?: { status?: string } | null;
  items?: Array<{ thumbnail_url?: string }>;
};

type RecentActivityItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

function greeting(now: Date) {
  const hour = now.getHours();
  const period = hour < 12 ? "아침" : hour < 18 ? "오후" : "저녁";
  return `${now.toLocaleDateString("ko-KR", { weekday: "long" })} ${period}입니다.`;
}

function taskCountSentence(count: number) {
  const labels = ["없습니다", "한 건 있습니다", "두 건 있습니다", "세 건 있습니다", "네 건 있습니다"];
  return labels[count] ?? `${count}건 있습니다`;
}

export function HomeChat() {
  const { data: dashboard, state: dashboardState } = useHomeDashboardData();
  const [status, setStatus] = useState<StatusPanelData | null>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const launchHref = useDesktopAppLauncher();
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.allSettled([
      fetch("/api/olivia-os/status-panel", { cache: "no-store", signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => { if (payload?.ok) setStatus(payload); }),
      fetch("/api/galleries", { cache: "no-store", signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => {
          if (!payload?.ok || payload.mock) return;
          const match = (payload.galleries as Gallery[]).find((item) => (
            ["final_photo", "final", "retouched", "completed"].includes(item.gallery_type ?? "")
            || item.publication?.status === "published"
          ));
          setGallery(match ?? null);
        }),
      fetch("/api/admin/recent-activity", { cache: "no-store", signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => {
          if (active && payload?.ok) setActivities(payload.items ?? []);
        })
        .finally(() => {
          if (active) setActivitiesLoading(false);
        }),
    ]);
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const tasks = status?.myTurn.slice(0, 4) ?? [];
  const schedule = dashboard?.todayTasks ?? [];
  const todayTasks = dashboard?.workspaceTodayTasks ?? [];
  const firstSchedule = schedule[0];
  const firstTodayTask = todayTasks[0];
  const firstActivity = activities[0];
  const photo = gallery?.items?.find((item) => item.thumbnail_url)?.thumbnail_url;
  const dateLine = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const openCalendar = () => {
    const app = getOliviaApp("calendar");
    if (!app) return;
    openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height });
  };

  return (
    <section className={styles.homeChat} style={photo ? { backgroundImage: `linear-gradient(180deg, rgba(22,48,43,.64), rgba(22,48,43,.91)), url("${photo}")` } : undefined}>
      <div className={styles.homeChatCenter}>
        <div className={styles.homeChatOverview}>
          <h1>{greeting(now)} <span>먼저 볼 게 {taskCountSentence(tasks.length)}.</span></h1>
          <p className={styles.homeChatSubline}>{dateLine} · 오늘의 일과 촬영 작업을 한곳에서 이어갑니다.</p>
          <div className={styles.homeTodaySummary} aria-label="오늘 요약">
            <button type="button" onClick={openCalendar}>
              <span>오늘 일정 <b>{schedule.length}</b></span>
              <strong>
                {dashboardState === "loading"
                  ? "불러오는 중"
                  : firstSchedule
                    ? `${firstSchedule.time?.slice(0, 5) || "종일"} · ${firstSchedule.title}`
                    : "없음"}
              </strong>
            </button>
            <button type="button" onClick={openCalendar}>
              <span>오늘 할 일 <b>{todayTasks.length}</b></span>
              <strong>{dashboardState === "loading" ? "불러오는 중" : firstTodayTask?.title ?? "없음"}</strong>
            </button>
            <article>
              <span>최근 작업 <b>{activities.length}</b></span>
              <strong title={firstActivity?.detail}>{activitiesLoading ? "불러오는 중" : firstActivity?.title ?? "없음"}</strong>
            </article>
          </div>
          <div className={styles.homeTaskList} aria-label="내 차례">
            {tasks.map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => entry.href && launchHref(entry.href, entry.title, {
                  clientId: entry.clientId ?? undefined,
                  workflowRunId: entry.workflowRunId ?? undefined,
                  projectId: entry.projectId ?? undefined,
                })}
              >
                <span><strong>{entry.title}</strong>{entry.detail ? <small>{entry.detail}</small> : null}</span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </div>
        <OliviaChatDockTarget id="desktop-home" priority={90} className={styles.homeChatDock} />
      </div>
      {gallery ? <p className={styles.homePhotoCredit}>{gallery.hospital_name ?? "최근 촬영"}{gallery.shoot_date ? ` · ${gallery.shoot_date}` : ""}</p> : null}
    </section>
  );
}
