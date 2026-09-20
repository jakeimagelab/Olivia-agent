"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEPARTMENT_DISPLAY, type MedicalDepartment } from "@/lib/photo-classifier/types";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [department, setDepartment] = useState<MedicalDepartment | "">("");
  const [shootingMode, setShootingMode] = useState<"field" | "studio" | "">("");
  const [startError, setStartError] = useState<string | null>(null);
  const [restartConfirmationId, setRestartConfirmationId] = useState<string | null>(null);
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

  // 코드 요청서(2026-09-18) 작업 D — 예전에는 여기서 기존 사진작업실(수동 분류 화면)로
  // 딥링크해 그 화면의 "AI 자동 분류 시작"이 만드는 구식 PHOTO_SORT job으로 이어졌다. 이제는
  // PHASE 6 파이프라인(씬별분류/)으로 바로 연결한다 — "새 분류 엔진을 만들지 말 것"은 여전히
  // 지킨다(PHASE 6는 이미 있는 엔진, nas_backup_start_sort 도구와 같은 헬퍼를 재사용한다).
  // department/shootingMode는 이 카드에서 추측하지 않고 아래 인라인 선택 UI로 사람이 직접
  // 고른 값만 쓴다.
  const openPicker = useCallback((event: WorkerEvent) => {
    setStartError(null);
    setDepartment("");
    setShootingMode("");
    setRestartConfirmationId(null);
    setExpandedId(event.id);
  }, []);

  const cancelPicker = useCallback(() => {
    setExpandedId(null);
    setStartError(null);
    setRestartConfirmationId(null);
  }, []);

  const confirmStart = useCallback(async (event: WorkerEvent, confirmRestart = false) => {
    if (!department || !shootingMode) return;
    setStartingId(event.id);
    setStartError(null);
    try {
      const response = await fetch(`/api/worker/events/${event.id}/start-classification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, shootingMode, confirmRestart }),
      });
      const body = await response.json().catch(() => ({ ok: false }));
      if (response.status === 409 && body.code === "PHOTO_PROJECT_RESTART_CONFIRMATION_REQUIRED") {
        setRestartConfirmationId(event.id);
        setStartError(body.error || "기존 작업 기록이 있습니다. 다시 시작할까요?");
        return;
      }
      if (!response.ok || !body.ok) throw new Error(body.error || "분류 시작에 실패했습니다.");
      setEvents((current) => current.filter((entry) => entry.id !== event.id));
      setExpandedId(null);
      setRestartConfirmationId(null);
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : "분류 시작에 실패했습니다.");
    } finally {
      setStartingId(null);
    }
  }, [department, shootingMode]);

  if (!events.length) return null;

  return (
    <div className={styles.stack} aria-live="polite">
      {events.map((event) => (
        <div key={event.id} className={styles.card} role="status">
          <div className={styles.title}><span className={styles.dot} aria-hidden="true" /> 새 촬영 데이터가 백업되었습니다</div>
          <div className={styles.folder}>{event.folder_name}</div>
          <div className={styles.meta}>{event.file_count.toLocaleString("ko-KR")}개 파일 · {formatBytes(event.total_bytes)}</div>
          {expandedId === event.id ? (
            <div className={styles.picker}>
              <select
                className={styles.select}
                value={department}
                onChange={(e) => setDepartment(e.target.value as MedicalDepartment)}
              >
                <option value="">진료과 선택</option>
                {Object.entries(DEPARTMENT_DISPLAY).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <div className={styles.modeToggle}>
                <button
                  type="button"
                  className={shootingMode === "field" ? styles.modeActive : styles.mode}
                  onClick={() => setShootingMode("field")}
                >출장</button>
                <button
                  type="button"
                  className={shootingMode === "studio" ? styles.modeActive : styles.mode}
                  onClick={() => setShootingMode("studio")}
                >스튜디오</button>
              </div>
              {startError ? <div className={styles.error}>{startError}</div> : null}
              <div className={styles.actions}>
                <button type="button" className={styles.later} onClick={cancelPicker}>취소</button>
                <button
                  type="button"
                  className={styles.start}
                  disabled={!department || !shootingMode || startingId === event.id}
                  onClick={() => void confirmStart(event, restartConfirmationId === event.id)}
                >{startingId === event.id ? "시작 중..." : restartConfirmationId === event.id ? "다시 시작 확인" : "확인"}</button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              <button type="button" className={styles.later} onClick={() => handleLater(event)}>나중에</button>
              <button type="button" className={styles.start} onClick={() => openPicker(event)}>분류 시작</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
