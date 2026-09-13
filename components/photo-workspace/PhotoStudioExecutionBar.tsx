"use client";

import { Laptop, RefreshCw, Server } from "lucide-react";
import RemoteJobProgress from "./RemoteJobProgress";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import styles from "./PhotoStudioExecutionBar.module.css";

function relativeLastSeen(value: string | null): string {
  if (!value) return "확인 중";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return `${seconds}초 전`;
  return `${Math.floor(seconds / 60)}분 전`;
}

export default function PhotoStudioExecutionBar() {
  const {
    executionMode,
    availableModes,
    setExecutionMode,
    remoteJob,
    remoteJobActive,
    remotePollingState,
    remotePollingMessage,
    workerPresence,
    workerPollingState,
    refreshWorkerPresence,
  } = usePhotoStudioExecution();
  const remote = executionMode === "REMOTE_WORKER";

  return (
    <section className={styles.shell} aria-label="사진작업실 작업 위치">
      <div className={styles.inner}>
        <div className={styles.modeGroup}>
          <span className={styles.label}>작업 위치</span>
          <div className={styles.modes}>
            {availableModes.includes("LOCAL_DIRECT") ? (
              <button type="button" aria-pressed={!remote} onClick={() => setExecutionMode("LOCAL_DIRECT")}>
                <Laptop size={15} /> 이 기기에서 작업
              </button>
            ) : null}
            <button type="button" aria-pressed={remote} onClick={() => setExecutionMode("REMOTE_WORKER")}>
              <Server size={15} /> Mac Studio 원격 작업
            </button>
          </div>
        </div>

        {remote ? (
          <div className={styles.remoteState}>
            <span data-state={workerPresence.online === true ? "online" : workerPresence.online === false ? "offline" : "unknown"}>
              <i /> Mac Studio {workerPresence.online === true ? "Online" : workerPresence.online === false ? "Offline" : "확인 중"}
            </span>
            <span data-state={workerPresence.nasConnected === true ? "online" : workerPresence.nasConnected === false ? "offline" : "unknown"}>
              <i /> NAS {workerPresence.nasConnected === true ? "Connected" : workerPresence.nasConnected === false ? "Disconnected" : "확인 중"}
            </span>
            <small>마지막 연결: {relativeLastSeen(workerPresence.lastSeenAt)}</small>
            {workerPollingState === "reconnecting" ? (
              <button type="button" onClick={refreshWorkerPresence}><RefreshCw size={12} /> 다시 확인</button>
            ) : null}
          </div>
        ) : null}

        {remote && (remoteJobActive || remoteJob?.status === "COMPLETED" || remoteJob?.status === "FAILED") ? (
          <RemoteJobProgress
            compact
            job={remoteJob}
            pollingState={remotePollingState}
            pollingMessage={remotePollingMessage}
          />
        ) : null}
      </div>
    </section>
  );
}
