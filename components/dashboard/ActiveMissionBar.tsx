"use client";

import { useEffect, useState } from "react";
import MissionStatusBar from "@/components/olivia/ui/MissionStatusBar";
import { useCoreProjectSnapshot } from "@/lib/core/client/useCoreProjectSnapshot";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { formatProjectMissionTitle } from "@/lib/clientWorkspace/projectOverview";

type WorkflowRun = {
  id: string;
  client_id: string | null;
  client_name: string;
  project_id?: string | null;
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

type ActiveMissionBarProps = {
  /** 특정 워크플로우로 고정하고 싶을 때(견적/콘티 빌더가 이미 그 대상을 알 때) 지정한다.
   *  생략하면 가장 최근에 업데이트된 활성 워크플로우를 자동으로 보여준다. */
  workflowRunId?: string;
};

// 홈/캘린더/견적/콘티가 함께 쓰는 MissionStatusBar 데이터 래퍼 — 기본은 가장 최근에
// 업데이트된 활성 워크플로우를 "현재 미션"으로 노출한다(기존 RecentProjects가 쓰는
// /api/workflow/summary 그대로 재사용, 페이지별로 새로 데이터를 만들지 않는다 — 40절).
export default function ActiveMissionBar({ workflowRunId }: ActiveMissionBarProps = {}) {
  const [summaryRun, setSummaryRun] = useState<WorkflowRun | null | undefined>(workflowRunId ? null : undefined);
  const activeClientId = useOliviaContextStore((state) => state.activeClientId);
  const activeClientName = useOliviaContextStore((state) => state.activeClientName);
  const setContextLink = useOliviaContextStore((state) => state.setContextLink);
  const selectedWorkflowRunId = workflowRunId || summaryRun?.id;
  const { snapshot, loading: snapshotLoading } = useCoreProjectSnapshot(selectedWorkflowRunId);

  useEffect(() => {
    if (workflowRunId) {
      setSummaryRun(null);
      return;
    }
    let cancelled = false;
    fetch("/api/workflow/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data?.workflowRuns)) return;
        const runs = data.workflowRuns as WorkflowRun[];
        const active = runs
          .filter((candidate) => candidate.status === "active")
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setSummaryRun(active[0] ?? null);
      })
      .catch(() => { if (!cancelled) setSummaryRun(null); });
    return () => { cancelled = true; };
  }, [workflowRunId]);

  if ((!workflowRunId && summaryRun === undefined) || (selectedWorkflowRunId && snapshotLoading && !snapshot)) {
    return <MissionStatusBar title="" loading />;
  }
  if (!snapshot) return null;

  const clientName = snapshot.client.name || "이름 없는 고객";
  const projectName = snapshot.project.name || "프로젝트";
  const title = formatProjectMissionTitle(clientName, projectName);
  const differsFromChatTarget = Boolean(
    (activeClientId && snapshot.client.id && activeClientId !== snapshot.client.id)
    || (!activeClientId && activeClientName && activeClientName !== clientName)
    || (!activeClientId && !activeClientName && snapshot.client.id),
  );

  return (
    <MissionStatusBar
      title={title}
      status={snapshot.project.status === "completed" ? "완료" : snapshot.project.status === "paused" ? "보류" : "진행 중"}
      currentStage={snapshot.workflow.currentStepName}
      nextScheduleLabel={formatShootDate(summaryRun?.shoot_date)}
      owner={summaryRun?.manager_name || undefined}
      progress={snapshot.workflow.progressPercent}
      detailHref={snapshot.client.id ? `/clients?clientId=${snapshot.client.id}` : "/clients"}
      contextNotice={differsFromChatTarget ? "추천 미션 · 현재 채팅 대상과 다름" : undefined}
      onDetailClick={() => setContextLink({
        clientId: snapshot.client.id || undefined,
        clientName,
        projectId: snapshot.project.workflowRunId,
        projectName,
      })}
    />
  );
}
