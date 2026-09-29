"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import styles from "./OliviaDesktop.module.css";

type PhotoJob = {
  id: string;
  action: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | string;
  payload?: { source_relative_path?: string; work_relative_path?: string; only?: "all" | "연출" | "프로필" | "인테리어" } | null;
  progress?: { stage?: string; current?: number; total?: number; message?: string } | null;
  message?: string | null;
  error?: string | null;
  completed_at?: string | null;
};

const PHOTO_ACTIONS = new Set(["PHOTO_PREPARE_SOURCE", "PHOTO_STAGE_JPG", "PHOTO_CLASSIFY_WORK"]);
const STAGE_LABEL: Record<string, string> = {
  STAGING: "복사 준비 중",
  PREPARING: "JPG정리 중",
  COPYING: "Agentstation 복사 중",
  SCANNING: "스캔 중",
  ANALYZING: "분석 중",
  SCENE_ANALYSIS: "장면 분석",
  FEATURE_EXTRACTION: "특징 추출",
  BOUNDARY_ANALYSIS: "경계 분석",
  ORGANIZING: "정리 중",
  VERIFYING: "검증 중",
};

function operationLabel(job: PhotoJob): string {
  if (job.action === "PHOTO_PREPARE_SOURCE") return "JPG정리";
  if (job.action === "PHOTO_STAGE_JPG") return "JPG정리";
  if (job.payload?.only === "연출" || job.payload?.only === "프로필" || job.payload?.only === "인테리어") return `${job.payload.only}정리`;
  return "분류";
}

function folderName(job: PhotoJob): string {
  const raw = job.payload?.source_relative_path || job.payload?.work_relative_path || "촬영 폴더";
  return raw.split("/").at(-1) || raw;
}

/** 데스크톱 상태 패널과 별개의 실행 표시줄. 실패는 사용자가 닫을 때까지 남긴다. */
export function PhotoTaskStatusBar() {
  const [jobs, setJobs] = useState<PhotoJob[]>([]);

  useEffect(() => {
    let mounted = true;
    const read = async () => {
      try {
        const response = await fetch("/api/remote-jobs", { cache: "no-store" });
        const body = await response.json();
        if (!mounted || !response.ok || !body?.ok) return;
        const now = Date.now();
        setJobs((body.jobs as PhotoJob[] ?? []).filter((job) => {
          if (!PHOTO_ACTIONS.has(job.action)) return false;
          if (job.status === "FAILED") return true;
          if (job.status === "QUEUED" || job.status === "RUNNING") return true;
          return job.status === "COMPLETED" && job.completed_at
            ? now - new Date(job.completed_at).getTime() < 8_000
            : false;
        }));
      } catch {
        // 상태 표시는 본문을 막으면 안 된다. 다음 주기에 다시 확인한다.
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 5_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const visible = useMemo(() => jobs.slice(0, 4), [jobs]);
  if (!visible.length) return null;

  return (
    <aside className={styles.photoTaskStatusBar} aria-live="polite" aria-label="사진 작업 진행 상태">
      {visible.map((job) => {
        const failed = job.status === "FAILED";
        const done = job.status === "COMPLETED";
        const stage = done ? "완료" : STAGE_LABEL[job.progress?.stage?.toUpperCase() ?? ""] || (job.status === "QUEUED" ? "대기 중" : "작업 중");
        const count = job.progress?.current !== undefined && job.progress?.total !== undefined
          ? `${job.progress.current.toLocaleString()} / ${job.progress.total.toLocaleString()}장`
          : null;
        return (
          <div key={job.id} className={styles.photoTaskStatusRow} data-state={failed ? "failed" : done ? "done" : "running"}>
            {failed ? <TriangleAlert size={15} /> : done ? <Check size={15} /> : <LoaderCircle size={15} className={styles.photoTaskStatusSpin} />}
            <span><strong>{operationLabel(job)} · {folderName(job)}</strong><small>{failed ? (job.error || job.message || "작업에 실패했습니다.") : `${stage}${count ? ` · ${count}` : ""}`}</small></span>
          </div>
        );
      })}
    </aside>
  );
}
