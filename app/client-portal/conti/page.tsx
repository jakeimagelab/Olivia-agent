"use client";

import { FileText } from "lucide-react";
import { PortalCard, PortalError, PortalLoading, PortalPageShell } from "../_components/PortalShell";
import { usePortalDashboard } from "../_hooks/usePortalDashboard";

export default function PortalContiPage() {
  const { session, data, loading, error, dataError } = usePortalDashboard();
  if (loading) return <PortalLoading />;
  if (!session || error || dataError) return <PortalError message={error || dataError || "프로젝트를 불러오지 못했습니다."} />;

  return (
    <PortalPageShell session={session} active="콘티">
      <main className="pcrm-portal-subpage">
        <div className="pcrm-portal-subpage-title"><span>PCRM · CONTI</span><h1>촬영 콘티</h1><p>담당자가 공개한 촬영 장면과 진행 방향을 확인합니다.</p></div>
        {(data.contiSaves ?? []).length === 0 ? (
          <PortalCard><div className="pcrm-client-empty">아직 공개된 촬영 콘티가 없습니다.</div></PortalCard>
        ) : data.contiSaves.map((conti: any) => {
          const scenes = Array.isArray(conti.result?.conti) ? conti.result.conti : [];
          return (
            <PortalCard key={conti.id} className="pcrm-conti-card">
              <header><FileText size={19} /><div><h2>{conti.title || "촬영 콘티"}</h2><span>장면 {scenes.length}개</span></div></header>
              <div>{scenes.map((scene: any, index: number) => (
                <article key={index}><b>{index + 1}</b><div><strong>{scene.category || scene.title || "촬영 장면"}</strong>{scene.description && <p>{scene.description}</p>}{scene.location && <span>{scene.location}</span>}</div></article>
              ))}</div>
            </PortalCard>
          );
        })}
      </main>
    </PortalPageShell>
  );
}
