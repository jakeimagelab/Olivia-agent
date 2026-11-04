"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Circle, FolderOpen, HardDrive, RefreshCw, Server, Sparkles } from "lucide-react";
import type { MobileOliviaTarget } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

type Worker = { id: string; online: boolean | null; nas_connected: boolean | null; worker_status: string | null };
type Job = { id: string; action: string; payload: Record<string, unknown> | null; status: string; progress: { current?: number; total?: number; message?: string } | null; created_at: string };

const STAGES = [
  { action: "PHOTO_SORT", label: "JPG 정리" },
  { action: "PHOTO_CLASSIFY_WORK", label: "Scene 분류" },
  { action: "PHOTO_RAW_MATCH", label: "RAW 매칭" },
  { action: "PHOTO_AI_SELECT", label: "사진 셀렉" },
  { action: "PHOTO_RETOUCH", label: "사진보정" },
  { action: "PHOTO_RESIZE", label: "리사이즈" },
] as const;

function pathOf(job?: Job | null) {
  const payload = job?.payload || {};
  return String(payload.remote_path || payload.source_folder || payload.source_relative_path || payload.folder || "");
}
function folderName(value: string) { return value.split("/").filter(Boolean).at(-1)?.normalize("NFC") || "현재 작업"; }
function numberOf(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

export default function MobileBridgeStatus({ onRequestOlivia }: { onRequestOlivia: (target: MobileOliviaTarget) => void }) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [workerResponse, jobsResponse] = await Promise.all([fetch("/api/remote-workers/status", { cache: "no-store" }), fetch("/api/remote-jobs", { cache: "no-store" })]);
      const [workerPayload, jobsPayload] = await Promise.all([workerResponse.json(), jobsResponse.json()]);
      if (!workerResponse.ok || !workerPayload.ok) throw new Error(workerPayload.error || "Mac Studio 상태를 확인하지 못했어요.");
      if (!jobsResponse.ok || !jobsPayload.ok) throw new Error(jobsPayload.error || "Bridge 작업을 확인하지 못했어요.");
      setWorker(workerPayload.worker || null);
      setJobs(Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : []);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bridge 상태를 확인하지 못했어요."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000); return () => window.clearInterval(timer); }, [load]);

  const photoJobs = useMemo(() => jobs.filter((job) => job.action.startsWith("PHOTO_")), [jobs]);
  const active = photoJobs.find((job) => ["QUEUED", "RUNNING"].includes(job.status)) || photoJobs[0] || null;
  const activePath = pathOf(active);
  const relatedJobs = activePath ? photoJobs.filter((job) => pathOf(job) === activePath) : photoJobs.slice(0, 8);
  const payload = active?.payload || {};
  const selectedNames = Array.isArray(payload.selected_file_names) ? payload.selected_file_names : Array.isArray(payload.file_names) ? payload.file_names : [];
  const jpg = numberOf(payload.jpg_count) || numberOf(active?.progress?.total);
  const raw = numberOf(payload.raw_count);
  const excluded = numberOf(payload.excluded_count);

  return <section className={`${styles.screenWithHeader} ${styles.mobileStatusScreen}`} aria-label="Bridge 모바일 상태">
    <header className={styles.mobilePageHeading}><div><small>원격 작업</small><h1>Bridge</h1></div><button type="button" onClick={() => void load()} aria-label="새로고침"><RefreshCw size={19} /></button></header>
    <div className={styles.mobileStatusBody}>
      {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : null}
      <section className={styles.mobileConnectionCard}>
        <span><Server size={20} /><strong>Mac Studio</strong><em data-online={worker?.online === true}>{worker?.online === true ? "연결됨" : worker?.online === false ? "오프라인" : "확인 중"}</em></span>
        <span><HardDrive size={20} /><strong>NAS</strong><em data-online={worker?.nas_connected === true}>{worker?.nas_connected === true ? "연결됨" : worker?.nas_connected === false ? "연결 안 됨" : "확인 중"}</em></span>
      </section>
      {loading ? <div className={styles.emptyState}>현재 작업을 확인하고 있어요...</div> : active ? <>
        <section className={styles.mobileCurrentJobCard}>
          <small>현재 작업</small><h2>{folderName(activePath)}</h2><p><FolderOpen size={15} />{activePath || "작업 경로 없음"}</p>
          <div className={styles.mobileFileCounts}><span><strong>{jpg.toLocaleString()}</strong><small>JPG</small></span><span><strong>{raw.toLocaleString()}</strong><small>RAW</small></span><span><strong>{selectedNames.length.toLocaleString()}</strong><small>선택</small></span><span><strong>{excluded.toLocaleString()}</strong><small>제외</small></span></div>
          {active.progress?.total ? <div className={styles.mobileProgressBar}><i style={{ width: `${Math.min(100, Math.round(numberOf(active.progress.current) / active.progress.total * 100))}%` }} /></div> : null}
          <b className={styles.mobileJobStatus}>{active.status === "COMPLETED" ? "완료" : active.status === "FAILED" ? "실패" : active.status === "RUNNING" ? "작업 중" : "대기 중"}{active.progress?.message ? ` · ${active.progress.message}` : ""}</b>
        </section>
        <section className={styles.mobileStageCard}><h2>작업 상태</h2>{STAGES.map((stage) => {
          const job = relatedJobs.find((item) => item.action === stage.action);
          const done = job?.status === "COMPLETED";
          const running = job && ["QUEUED", "RUNNING"].includes(job.status);
          return <div key={stage.action} data-state={done ? "done" : running ? "running" : "pending"}>{done ? <Check size={16} /> : running ? <span className={styles.mobileRunningDot} /> : <Circle size={14} />}<span>{stage.label}</span><small>{done ? "완료" : running ? "진행 중" : "대기"}</small></div>;
        })}</section>
        <button type="button" className={styles.mobilePrimaryAction} disabled={!activePath} onClick={() => onRequestOlivia({ source: "bridge", title: folderName(activePath), bridgeSelectionId: activePath })}><Sparkles size={17} />Olivia에게 작업 요청</button>
      </> : <div className={styles.emptyState}><FolderOpen size={22} /><span>현재 Bridge 작업이 없어요.</span><small>데스크톱 Bridge에서 폴더를 열면 여기에 상태가 표시됩니다.</small></div>}
    </div>
  </section>;
}
