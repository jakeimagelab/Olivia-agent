"use client";

import { CalendarDays, CircleCheck } from "lucide-react";
import { PortalCard, PortalError, PortalLoading, PortalPageShell } from "../_components/PortalShell";
import { usePortalDashboard } from "../_hooks/usePortalDashboard";

export default function PortalPreparationPage() {
  const { session, data, loading, error, dataError } = usePortalDashboard();
  if (loading) return <PortalLoading />;
  if (!session || error || dataError) return <PortalError message={error || dataError || "프로젝트를 불러오지 못했습니다."} />;
  const run = data.workflowRun;
  const items = ["촬영일 확인", "촬영 장소와 주차", "의료진 및 직원 명단", "의상·가운·스크럽", "촬영 공간과 동선", "참고 이미지"];

  return (
    <PortalPageShell session={session} active="촬영 준비">
      <main className="pcrm-portal-subpage">
        <div className="pcrm-portal-subpage-title"><span>PCRM · PREPARATION</span><h1>촬영 준비</h1><p>촬영 전 함께 확인할 기본 항목입니다.</p></div>
        <div className="pcrm-preparation-grid">
          <PortalCard className="pcrm-preparation-list">
            <h2>준비 체크</h2>
            {items.map((item) => <article key={item}><CircleCheck size={17} /><span>{item}</span><b>확인 예정</b></article>)}
          </PortalCard>
          <PortalCard className="pcrm-preparation-summary">
            <CalendarDays size={20} />
            <span>촬영 예정일</span>
            <strong>{run?.shoot_date ? new Date(run.shoot_date).toLocaleDateString("ko-KR") : "일정 미정"}</strong>
            <p>{run?.project_memo || "담당 매니저가 필요한 준비사항을 안내해 드립니다."}</p>
          </PortalCard>
        </div>
      </main>
    </PortalPageShell>
  );
}
