"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePortalSession } from "../_hooks/usePortalSession";
import { PortalHeader, PortalNav, PortalCard, PortalError, PortalLoading, StatusBadge } from "../_components/PortalShell";
import { ACTIVE_WORKFLOW_STEPS, WORKFLOW_STAGES } from "@/lib/workflow";
import { C } from "@/lib/theme";

const G = C.teal, OR = C.orange, MUT = C.muted, BRD = C.border;

type DashboardData = {
  client: any;
  galleries: any[];
  revisions: any[];
  hasReview: boolean;
  per: any;
  events: any[];
  approvedSteps: any[];
  workflowRun: any;
  quotes: any[];
  contracts: any[];
  contiSaves: any[];
};

export default function PortalDashboard() {
  const { session, loading, error, token } = usePortalSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!token || loading) return;
    fetch("/api/client-portal/dashboard", { headers: { "x-portal-token": token } })
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); })
      .finally(() => setDataLoading(false));
  }, [token, loading]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} />;
  if (!session) return <PortalError message="세션 정보를 불러올 수 없습니다." />;
  if (dataLoading) return <PortalLoading />;

  const gallery = data?.galleries?.[0];
  const hasGallery = !!gallery?.nas_link;
  const quotes = data?.quotes ?? [];
  const contracts = data?.contracts ?? [];
  const contiSaves = data?.contiSaves ?? [];

  return (
    <div>
      <PortalHeader clientName={session.clientName} />
      <PortalNav active="홈" />

      <div style={{ maxWidth:780, margin:"0 auto", padding:"24px 16px 80px" }}>
        {/* 환영 카드 */}
        <PortalCard style={{ marginBottom:16, background:`linear-gradient(135deg, ${G}, #22876A)`, color:"#fff", border:"none" }}>
          <div style={{ fontSize:11, opacity:.75, fontWeight:600, letterSpacing:.5, marginBottom:6 }}>PHOTOCLINIC · 고객 전용 포털</div>
          <h1 style={{ margin:"0 0 4px", fontSize:20, fontWeight:800 }}>{session.clientName}</h1>
          <p style={{ margin:"0 0 12px", fontSize:13, opacity:.8 }}>담당자: {session.managerName || "—"}</p>
          <StatusBadge status={session.workflowStatus} />
        </PortalCard>

        {/* 대표가 승인해 고객에게 공개한 결과만 표시 */}
        <PortalCard style={{ marginBottom:16 }}>
          <div className="portal-approved-timeline__heading">
            <div><span>APPROVED TIMELINE</span><h2>확인 가능한 진행 결과</h2></div>
            <b>{data?.approvedSteps?.length ?? 0}건 공개</b>
          </div>
          {(data?.approvedSteps?.length ?? 0) === 0 ? (
            <div className="portal-approved-timeline__empty">담당자가 승인한 결과가 이곳에 순서대로 공개됩니다.</div>
          ) : (
            <div className="portal-approved-timeline">
              {data!.approvedSteps.map((item: any, index: number) => {
                const step = ACTIVE_WORKFLOW_STEPS.find((candidate) => candidate.key === item.stepKey);
                const stage = WORKFLOW_STAGES.find((candidate) => candidate.key === step?.stage);
                const documentUrl = getDocumentUrl(item.preview_data);
                const needsRevision = item.status === "revision_requested";
                return (
                  <article key={item.id} className={`portal-approved-step ${needsRevision ? "is-revision" : ""}`}>
                    <div className="portal-approved-step__rail"><span>{needsRevision ? "!" : "✓"}</span>{index < data!.approvedSteps.length - 1 && <i/>}</div>
                    <div className="portal-approved-step__body">
                      <div className="portal-approved-step__top">
                        <div><small>{stage?.name}</small><strong>{item.stepName || item.title}</strong></div>
                        <b>{needsRevision ? "수정 요청됨" : "승인·공개"}</b>
                      </div>
                      {item.description && <p>{item.description}</p>}
                      <div className="portal-approved-step__actions">
                        {documentUrl && <a href={documentUrl} target="_blank" rel="noreferrer">승인 문서 보기 ↗</a>}
                        {item.status === "approved" && (
                          <Link href={`/client-portal/revision?approvalId=${encodeURIComponent(item.id)}`}>이 결과 수정 요청</Link>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </PortalCard>

        {/* 퀵 메뉴 카드 */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          {[
            { href:"/client-portal/gallery",  icon:"🖼️", label:"갤러리 확인", desc:"촬영 결과물 보기", highlight: hasGallery },
            { href:"/client-portal/revision",  icon:"✏️", label:"수정 요청",   desc:"보정·콘텐츠 수정 요청", highlight: (data?.revisions?.length ?? 0) > 0 },
            { href:"/client-portal/review",    icon:"⭐", label:"리뷰 작성",   desc:"촬영 후기 남기기", highlight: !data?.hasReview },
            { href:"/client-portal/per",       icon:"🎁", label:"PER 포인트",  desc:"리워드 포인트 확인", highlight: !!data?.per?.per_joined },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{ textDecoration:"none" }}>
              <div style={{ background:"#fff", borderRadius:14, border:`1.5px solid ${item.highlight ? OR+"33" : BRD}`, padding:"16px 14px", cursor:"pointer", transition:"box-shadow .15s", position:"relative" }}>
                {item.highlight && <div style={{ position:"absolute", top:10, right:10, width:8, height:8, borderRadius:"50%", background:OR }} />}
                <div style={{ fontSize:24, marginBottom:8 }}>{item.icon}</div>
                <div style={{ fontSize:13, fontWeight:800, color:"#1C2B28" }}>{item.label}</div>
                <div style={{ fontSize:11, color:MUT, marginTop:2 }}>{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* 갤러리 미리보기 */}
        {gallery && (
          <PortalCard style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:800, color:G }}>📸 최근 갤러리</span>
              <Link href="/client-portal/gallery" style={{ fontSize:12, color:G, fontWeight:700, textDecoration:"none" }}>전체 보기 →</Link>
            </div>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>{gallery.description || (gallery.gallery_type === "original" ? "원본 갤러리" : "보정 갤러리")}</div>
            {gallery.shoot_date && <div style={{ fontSize:12, color:MUT, marginBottom:10 }}>촬영일: {new Date(gallery.shoot_date).toLocaleDateString("ko-KR")}</div>}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {gallery.nas_link && <a href={gallery.nas_link} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:700, color:"#fff", background:G, borderRadius:8, padding:"7px 14px", textDecoration:"none" }}>갤러리 열기</a>}
            </div>
          </PortalCard>
        )}

        {/* 수정 요청 현황 */}
        {(data?.revisions?.length ?? 0) > 0 && (
          <PortalCard style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:800, color:G }}>✏️ 수정 요청 현황</span>
              <Link href="/client-portal/revision" style={{ fontSize:12, color:G, fontWeight:700, textDecoration:"none" }}>전체 →</Link>
            </div>
            {data!.revisions.slice(0,3).map((r: any) => (
              <div key={r.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${BRD}` }}>
                <span style={{ fontSize:13 }}>{r.title}</span>
                <span style={{ fontSize:11, color:r.status==="completed"?G:r.status==="in_progress"?OR:MUT, fontWeight:700 }}>
                  {r.status==="requested"?"접수됨":r.status==="in_progress"?"진행 중":r.status==="completed"?"완료":"반려"}
                </span>
              </div>
            ))}
          </PortalCard>
        )}

        {/* PER 포인트 */}
        {data?.per?.per_joined && (
          <PortalCard style={{ marginBottom:16, background:`${G}06`, border:`1px solid ${G}15` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:11, color:G, fontWeight:700, marginBottom:4 }}>🎁 PER 리워드 포인트</div>
                <div style={{ fontSize:24, fontWeight:800, color:G }}>{(data.per.available_points ?? 0).toLocaleString()}P</div>
                <div style={{ fontSize:11, color:MUT, marginTop:2 }}>사용 가능 포인트</div>
              </div>
              <Link href="/client-portal/per" style={{ fontSize:12, fontWeight:700, color:"#fff", background:G, borderRadius:10, padding:"8px 16px", textDecoration:"none" }}>확인하기</Link>
            </div>
          </PortalCard>
        )}

        {/* 안내 문구 */}
        <div style={{ textAlign:"center", padding:"20px 0", borderTop:`1px solid ${BRD}`, marginTop:8 }}>
          <p style={{ fontSize:12, color:"#9BB5B0", lineHeight:1.8, margin:0 }}>
            포토클리닉 촬영 진행상황과 전달 자료를 확인할 수 있는 고객 전용 페이지입니다.<br />
            문의사항은 담당 매니저에게 연락해주세요.
          </p>
        </div>
      </div>
    </div>
  );
}

function getDocumentUrl(preview: Record<string, unknown> | null | undefined) {
  if (!preview) return "";
  for (const key of ["pdf_url", "document_url", "download_url", "file_url"]) {
    const value = preview[key];
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  return "";
}
