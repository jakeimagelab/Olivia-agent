"use client";

import { useEffect, useState } from "react";
import MissionStatusBar from "@/components/olivia/ui/MissionStatusBar";

type WorkflowRun = {
  id: string;
  client_id: string | null;
  client_name: string;
  project_name?: string | null;
  manager_name?: string | null;
  shoot_date?: string | null;
  status: string;
  current_step_name: string;
  progress: number;
  updated_at: string;
};

function formatShootDate(value?: string | null) {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${weekday}) 촬영`;
}

// 홈 화면 전용 MissionStatusBar 데이터 래퍼 — 가장 최근에 업데이트된 활성 워크플로우를
// "현재 미션"으로 노출한다(기존 RecentProjects가 쓰는 /api/workflow/summary 그대로 재사용).
export default function HomeMissionBar() {
  const [run, setRun] = useState<WorkflowRun | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workflow/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data?.workflowRuns)) return;
        const active = (data.workflowRuns as WorkflowRun[])
          .filter((candidate) => candidate.status === "active")
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setRun(active[0] ?? null);
      })
      .catch(() => { if (!cancelled) setRun(null); });
    return () => { cancelled = true; };
  }, []);

  if (run === undefined) return <MissionStatusBar title="" loading />;
  if (!run) return null;

  return (
    <MissionStatusBar
      title={`${run.client_name || "이름 없는 고객"} ${run.project_name || "프로젝트"}`}
      status="진행 중"
      currentStage={run.current_step_name}
      nextScheduleLabel={formatShootDate(run.shoot_date)}
      owner={run.manager_name || undefined}
      progress={run.progress}
      detailHref={run.client_id ? `/clients?clientId=${run.client_id}` : "/clients"}
    />
  );
}
