"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import type { StatusPanelData } from "@/lib/system-status/panelTypes";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

type Gallery = {
  hospital_name?: string;
  shoot_date?: string;
  gallery_type?: string;
  publication?: { status?: string } | null;
  items?: Array<{ thumbnail_url?: string }>;
};

function greeting(now: Date) {
  const hour = now.getHours();
  const period = hour < 12 ? "아침" : hour < 18 ? "오후" : "저녁";
  return `${now.toLocaleDateString("ko-KR", { weekday: "long" })} ${period}입니다.`;
}

export function HomeChat() {
  const [status, setStatus] = useState<StatusPanelData | null>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const launchHref = useDesktopAppLauncher();
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    const controller = new AbortController();
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
    ]);
    return () => controller.abort();
  }, []);

  const tasks = status?.myTurn.slice(0, 4) ?? [];
  const photo = gallery?.items?.find((item) => item.thumbnail_url)?.thumbnail_url;
  const dateLine = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  return (
    <section className={styles.homeChat} style={photo ? { backgroundImage: `linear-gradient(180deg, rgba(22,48,43,.64), rgba(22,48,43,.91)), url("${photo}")` } : undefined}>
      <div className={styles.homeChatCenter}>
        <p className={styles.homeChatEyebrow}>{dateLine}</p>
        <h1>{greeting(now)} <span>먼저 볼 게 {tasks.length ? `${tasks.length}건` : "없습니다"}.</span></h1>
        <p className={styles.homeChatSubline}>오늘의 일과 촬영 작업을 한곳에서 이어갑니다.</p>
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
        <OliviaChatDockTarget id="desktop-home" priority={90} className={styles.homeChatDock} />
      </div>
      {gallery ? <p className={styles.homePhotoCredit}>{gallery.hospital_name ?? "최근 촬영"}{gallery.shoot_date ? ` · ${gallery.shoot_date}` : ""}</p> : null}
    </section>
  );
}
