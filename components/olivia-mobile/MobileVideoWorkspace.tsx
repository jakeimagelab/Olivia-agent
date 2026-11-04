"use client";

import { Film, RefreshCw, Sparkles } from "lucide-react";
import { jobFolderName, jobPercent, useVideoStudioJobs, useVideoStudioWorkers, videoStudioWorkerLabel } from "@/components/video-studio/useVideoStudio";
import type { MobileOliviaTarget } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

export default function MobileVideoWorkspace({ onRequestOlivia }: { onRequestOlivia: (target: MobileOliviaTarget) => void }) {
  const { jobs, loading, error, refresh } = useVideoStudioJobs();
  const { workers } = useVideoStudioWorkers();
  const active = jobs.find((job) => ["QUEUED", "RUNNING"].includes(job.status)) || jobs[0] || null;
  const percent = active ? jobPercent(active) : 0;
  return <section className={`${styles.screenWithHeader} ${styles.mobileStatusScreen}`} aria-label="모바일 영상작업실 상태"><header className={styles.mobilePageHeading}><div><small>상태 · 결과</small><h1>영상작업실</h1></div><button type="button" onClick={() => void refresh()} aria-label="새로고침"><RefreshCw size={19} /></button></header><div className={styles.mobileStatusBody}>{error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void refresh()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>영상 작업을 확인하고 있어요...</div> : active ? <><section className={styles.mobileCurrentJobCard}><small>최근 작업</small><h2>{jobFolderName(active)}</h2><p><Film size={15} />{active.action === "VIDEO_INTERVIEW_ANALYZE" ? "인터뷰 분석" : "오디오 추출"}</p><div className={styles.mobileProgressLabel}><strong>{active.status === "COMPLETED" ? "완료" : active.status === "FAILED" ? "실패" : "진행 중"}</strong><span>{percent}%</span></div><div className={styles.mobileProgressBar}><i style={{ width: `${percent}%` }} /></div><b className={styles.mobileJobStatus}>{videoStudioWorkerLabel(active.target_worker)} · {workers[active.target_worker]?.online ? "연결됨" : "상태 확인 중"}</b></section><button type="button" className={styles.mobilePrimaryAction} onClick={() => onRequestOlivia({ source: "video", title: jobFolderName(active), bridgeSelectionId: active.payload?.source_relative_path })}><Sparkles size={17} />Olivia에게 작업 요청</button></> : <div className={styles.emptyState}><Film size={22} /><span>최근 영상 작업이 없어요.</span></div>}</div></section>;
}
