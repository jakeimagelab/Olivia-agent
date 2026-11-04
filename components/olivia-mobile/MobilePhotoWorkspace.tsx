"use client";

import { CheckCircle2, FolderOpen, HardDrive, RefreshCw, Sparkles } from "lucide-react";
import { usePhotoProjectNotifications } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import type { MobileOliviaTarget } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

function statusLabel(status: string) {
  if (status.includes("COMPLETED")) return "완료";
  if (status.includes("FAILED") || status === "ERROR") return "오류";
  if (status.includes("QUEUED")) return "대기 중";
  if (status.includes("ING")) return "작업 중";
  if (status.includes("REVIEW") || status === "READY") return "확인 필요";
  return "준비 중";
}

export default function MobilePhotoWorkspace({ onRequestOlivia }: { onRequestOlivia: (target: MobileOliviaTarget) => void }) {
  const { projects, loading, error, refresh } = usePhotoProjectNotifications();
  const active = projects.find((project) => !project.status.includes("COMPLETED")) || projects[0] || null;
  return <section className={`${styles.screenWithHeader} ${styles.mobileStatusScreen}`} aria-label="모바일 사진작업실 상태">
    <header className={styles.mobilePageHeading}><div><small>상태 · 결과</small><h1>사진작업실</h1></div><button type="button" onClick={() => void refresh()} aria-label="새로고침"><RefreshCw size={19} /></button></header>
    <div className={styles.mobileStatusBody}>
      {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void refresh()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>사진 작업을 확인하고 있어요...</div> : active ? <>
        <section className={styles.mobileCurrentJobCard}><small>현재 작업</small><h2>{active.project_name}</h2><p><FolderOpen size={15} />{active.source_relative_path}</p><div className={styles.mobileFileCounts}><span><strong>{active.jpg_count.toLocaleString()}</strong><small>JPG</small></span><span><strong>{active.raw_count.toLocaleString()}</strong><small>RAW</small></span><span><strong>{active.classified_jpg_count.toLocaleString()}</strong><small>분류</small></span><span><strong>{active.scene_count.toLocaleString()}</strong><small>Scene</small></span></div><b className={styles.mobileJobStatus} data-status={active.status}>{statusLabel(active.status)}</b></section>
        <section className={styles.mobileStageCard}><h2>처리 단계</h2><div data-state={active.copy_completed_at ? "done" : active.copy_started_at ? "running" : "pending"}>{active.copy_completed_at ? <CheckCircle2 size={16} /> : <HardDrive size={16} />}<span>JPG 준비</span><small>{active.copied_jpg_count.toLocaleString()}장</small></div><div data-state={active.classification_completed_at ? "done" : active.classification_started_at ? "running" : "pending"}>{active.classification_completed_at ? <CheckCircle2 size={16} /> : <HardDrive size={16} />}<span>Scene 분류</span><small>{active.classified_jpg_count.toLocaleString()}장</small></div><div data-state={active.merge_completed_at ? "done" : active.merge_started_at ? "running" : "pending"}>{active.merge_completed_at ? <CheckCircle2 size={16} /> : <HardDrive size={16} />}<span>결과 정리</span><small>{active.merged_jpg_count.toLocaleString()}장</small></div></section>
        <button type="button" className={styles.mobilePrimaryAction} onClick={() => onRequestOlivia({ source: "photo", title: active.project_name, workflowRunId: active.workflow_run_id || undefined, bridgeSelectionId: active.source_relative_path })}><Sparkles size={17} />Olivia에게 작업 요청</button>
      </> : <div className={styles.emptyState}><FolderOpen size={22} /><span>진행 중인 사진 작업이 없어요.</span></div>}
    </div>
  </section>;
}
