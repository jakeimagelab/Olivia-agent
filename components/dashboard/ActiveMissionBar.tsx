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
  /** 특정 워크플로우로 고정하고 싶을 때(견적/콘티 빌더가 이미 그 대상을 알 때) 지정한다. */
  workflowRunId?: string;
  /** 일반 작업창은 explicit, 홈/일정의 추천 영역만 recommendation을 명시한다. */
  mode?: "explicit" | "recommendation";
};

export function shouldLoadMissionSummary(mode: NonNullable<ActiveMissionBarProps["mode"]>, workflowRunId?: string) {
  return mode === "recommendation" && !workflowRunId;
}

export function missionSnapshotMatches(requestedRunId: string | undefined, snapshotRunId: string | undefined) {
  return Boolean(requestedRunId && snapshotRunId && requestedRunId === snapshotRunId);
}

// 홈/캘린더/견적/콘티가 함께 쓰는 MissionStatusBar 데이터 래퍼. 일반 작업창은 정확한
// workflowRunId만 표시하고, 최근 활성 미션 추천은 opt-in한 화면에서만 조회한다.
export default function ActiveMissionBar({ workflowRunId, mode = "explicit" }: ActiveMissionBarProps = {}) {
  const recommendation = mode === "recommendation";
  const [summaryRun, setSummaryRun] = useState<WorkflowRun | null | undefined>(workflowRunId || !recommendation ? null : undefined);
  const activeClientId = useOliviaContextStore((state) => state.activeClientId);
  const activeClientName = useOliviaContextStore((state) => state.activeClientName);
  const setContextLink = useOliviaContextStore((state) => state.setContextLink);
  const selectedWorkflowRunId = workflowRunId || summaryRun?.id;
  const { snapshot, loading: snapshotLoading } = useCoreProjectSnapshot(selectedWorkflowRunId);

  useEffect(() => {
    if (!shouldLoadMissionSummary(mode, workflowRunId)) {
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
  }, [mode, recommendation, workflowRunId]);

  if (!selectedWorkflowRunId) return null;
  if ((!workflowRunId && recommendation && summaryRun === undefined) || (snapshotLoading && !snapshot)) {
    return <MissionStatusBar title="" loading />;
  }
  if (!snapshot || !missionSnapshotMatches(selectedWorkflowRunId, snapshot.project.workflowRunId)) return null;

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
