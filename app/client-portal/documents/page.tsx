"use client";

import { FileText } from "lucide-react";
import { PortalCard, PortalError, PortalLoading, PortalPageShell, StatusBadge } from "../_components/PortalShell";
import { usePortalDashboard } from "../_hooks/usePortalDashboard";

export default function PortalDocumentsPage() {
  const { session, token, data, loading, error, dataError } = usePortalDashboard();
  if (loading) return <PortalLoading />;
  if (!session || error || dataError) return <PortalError message={error || dataError || "프로젝트를 불러오지 못했습니다."} />;

  const documents = [
    ...(data.quotes ?? []).map((item: any) => ({ ...item, type: "견적서", title: item.title || item.quote_number, status: "공개", artifactId: item.artifactId })),
    ...(data.contracts ?? []).map((item: any) => ({ ...item, type: "계약서", title: item.quote_number || "프로젝트 계약서", status: item.signature_data_url ? "서명 완료" : "서명 대기", artifactId: item.artifactId })),
    ...(data.contiSaves ?? []).map((item: any) => ({ ...item, type: "콘티", title: item.title || "촬영 콘티", status: "확인 가능", artifactId: null })),
  ];

  const openArtifact = async (artifactId: string) => {
    const response = await fetch(`/api/client-portal/artifact/${artifactId}`, { headers: { "x-portal-token": token } });
    const payload = await response.json();
    if (payload.ok && payload.url) window.open(payload.url, "_blank", "noopener,noreferrer");
  };

  return (
    <PortalPageShell session={session} active="문서함">
      <main className="pcrm-portal-subpage">
        <div className="pcrm-portal-subpage-title"><span>PCRM · DOCUMENTS</span><h1>프로젝트 문서함</h1><p>담당자가 공개한 견적서, 계약서와 촬영 자료를 확인합니다.</p></div>
        <PortalCard className="pcrm-document-list">
          {documents.length === 0 ? <div className="pcrm-client-empty">아직 공개된 문서가 없습니다.</div> : documents.map((item: any) => (
            <article key={`${item.type}-${item.id}`}>
              <FileText size={19} />
              <div><span>{item.type}</span><strong>{item.title}</strong><small>{item.created_at || item.saved_at ? new Date(item.created_at || item.saved_at).toLocaleDateString("ko-KR") : ""}</small></div>
              <StatusBadge status={item.status} />
              {item.artifactId ? <button onClick={() => openArtifact(item.artifactId)}>파일 보기</button> : <span className="pcrm-document-ready">포털에서 확인</span>}
            </article>
          ))}
        </PortalCard>
      </main>
    </PortalPageShell>
  );
}
