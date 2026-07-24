"use client";

import { PortalCard, PortalError, PortalLoading, PortalPageShell } from "../_components/PortalShell";
import PortalWorkflowProgress from "../_components/PortalWorkflowProgress";
import { usePortalDashboard } from "../_hooks/usePortalDashboard";
import { getClientNextAction } from "@/lib/pcrm/clientWorkflow";

export default function PortalProgressPage() {
  const { session, data, loading, error, dataError } = usePortalDashboard();
  if (loading) return <PortalLoading />;
  if (!session || error || dataError) return <PortalError message={error || dataError || "프로젝트를 불러오지 못했습니다."} />;
  const nextAction = getClientNextAction(session.currentStepKey);

  return (
    <PortalPageShell session={session} active="진행현황">
      <main className="pcrm-portal-subpage">
        <div className="pcrm-portal-subpage-title"><span>PCRM · PROGRESS</span><h1>프로젝트 진행현황</h1><p>내부 작업을 고객에게 필요한 10개 단계로 정리했습니다.</p></div>
        <PortalCard className="pcrm-progress-detail">
          <header><div><span>현재 프로젝트</span><h2>{session.projectName}</h2></div><strong>{session.projectProgress}%</strong></header>
          <PortalWorkflowProgress currentStepKey={session.currentStepKey} completed={session.projectStatus === "completed"} />
          <div className="pcrm-progress-next"><span>다음 확인 사항</span><strong>{nextAction.title}</strong></div>
        </PortalCard>
        <PortalCard className="pcrm-progress-activity">
          <h2>최근 프로젝트 활동</h2>
          {(data.activities ?? []).length === 0 ? <div className="pcrm-client-empty">기록된 프로젝트 활동이 없습니다.</div> : data.activities.map((item: any) => (
            <article key={item.id}><span>{new Date(item.created_at).toLocaleDateString("ko-KR")}</span><div><strong>{item.title}</strong><p>{item.description}</p></div></article>
          ))}
        </PortalCard>
      </main>
    </PortalPageShell>
  );
}
