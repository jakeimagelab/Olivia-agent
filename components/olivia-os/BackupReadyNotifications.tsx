"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import styles from "./BackupReadyNotifications.module.css";

type WorkerEvent = {
  id: string;
  folder_name: string;
  file_count: number;
  total_bytes: number;
  created_at: string;
};

const POLL_INTERVAL_MS = 45_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

// Olivia OS 2.0 PHASE 6 §10/§11 — NAS 백업 완료 알림. 기존 Olivia OS에는 toast/notification
// center 자체가 없어서(먼저 코드 확인 완료) 최소한의 카드 스택으로 새로 만든다 — 너무 큰
// 모달은 금지(§10)라 OliviaDesktop 우상단 App Window 위에 떠 있는 작은 카드로 구현한다.
export function BackupReadyNotifications() {
  const [events, setEvents] = useState<WorkerEvent[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mountedRef = useRef(true);

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch("/api/worker/events?status=PENDING", { cache: "no-store" });
      const body = await response.json().catch(() => ({ ok: false, events: [] }));
      // §13 "Application Error 방지" — 실패해도 이전 목록을 유지하고 예외를 던지지 않는다.
      if (mountedRef.current && response.ok && body.ok) setEvents(body.events ?? []);
    } catch {
      // 네트워크 실패는 다음 polling에서 다시 시도한다. 다른 Olivia 기능에는 영향 없음.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchEvents();
    const timer = setInterval(() => { void fetchEvents(); }, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [fetchEvents]);

  const updateStatus = useCallback(async (id: string, status: "ACKNOWLEDGED" | "STARTED") => {
    try {
      await fetch(`/api/worker/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // 상태 변경 실패해도 다음 polling에서 목록이 다시 맞춰진다 — 알림 기능 실패가 나머지
      // Olivia 기능에 영향을 주면 안 된다(§13).
    }
  }, []);

  const handleLater = useCallback((event: WorkerEvent) => {
    setEvents((current) => current.filter((entry) => entry.id !== event.id));
    void updateStatus(event.id, "ACKNOWLEDGED");
  }, [updateStatus]);

  // §11 "매우 중요. 새 분류 엔진을 만들지 말 것 — 기존 PHOTO_SORT Job 생성 코드를 재사용".
  // 여기서 바로 PHOTO_SORT job을 만들지 않고, 기존 사진작업실(분류 설정 화면)을 이 폴더가
  // 이미 선택된 상태로 연다 — department/gap_minutes 등 분류 파라미터를 이 알림 카드에서
  // 추측해서 넘기면 기존 화면이 수집하던 값을 건너뛰게 되므로, "AI 자동 분류 시작" 버튼은
  // 사용자가 기존 화면에서 그대로 누르게 둔다(기존 remote architecture 우회 금지).
  const handleStart = useCallback((event: WorkerEvent) => {
    setStartingId(event.id);
    void updateStatus(event.id, "STARTED");
    const photoApp = oliviaAppRegistry.find((app) => app.id === "photo-workspace");
    if (photoApp) {
      useOliviaDesktopStore.getState().openApp({
        appId: photoApp.id,
        title: photoApp.title,
        width: photoApp.defaultSize.width,
        height: photoApp.defaultSize.height,
      });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "classification");
    params.set("remoteFolder", event.folder_name);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    setEvents((current) => current.filter((entry) => entry.id !== event.id));
    setStartingId(null);
  }, [pathname, router, searchParams, updateStatus]);

  if (!events.length) return null;

  return (
    <div className={styles.stack} aria-live="polite">
      {events.map((event) => (
        <div key={event.id} className={styles.card} role="status">
          <div className={styles.title}><span className={styles.dot} aria-hidden="true" /> 새 촬영 데이터가 백업되었습니다</div>
          <div className={styles.folder}>{event.folder_name}</div>
          <div className={styles.meta}>{event.file_count.toLocaleString("ko-KR")}개 파일 · {formatBytes(event.total_bytes)}</div>
          <div className={styles.actions}>
            <button type="button" className={styles.later} onClick={() => handleLater(event)}>나중에</button>
            <button type="button" className={styles.start} disabled={startingId === event.id} onClick={() => handleStart(event)}>분류 시작</button>
          </div>
        </div>
      ))}
    </div>
  );
}
