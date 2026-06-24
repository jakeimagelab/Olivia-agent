"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePortalSession } from "../_hooks/usePortalSession";
import { PortalHeader, PortalNav, PortalCard, PortalError, PortalLoading, StatusBadge } from "../_components/PortalShell";

const G = "#155855", OR = "#E85D2C", MUT = "#5A7470", BRD = "rgba(21,88,85,.10)";

const WORKFLOW_STEPS = [
  "상담완료","견적확인","계약확인","콘티확인",
  "촬영예정","촬영완료","원본전달","보정진행",
  "갤러리전달","수정요청","최종완료","리뷰작성",
];

const STEP_ICONS: Record<string, string> = {
  "상담완료":"💬","견적확인":"📋","계약확인":"📝","콘티확인":"🎬",
  "촬영예정":"📅","촬영완료":"📸","원본전달":"📦","보정진행":"🖼️",
  "갤러리전달":"🖼️","수정요청":"✏️","최종완료":"✅","리뷰작성":"⭐",
};

type DashboardData = {
  client: any;
  galleries: any[];
  revisions: any[];
  hasReview: boolean;
  per: any;
  events: any[];
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

  if (loading || dataLoading) return <PortalLoading />;
  if (error) return <PortalError message={error} />;
  if (!session) return <PortalError message="세션 정보를 불러올 수 없습니다." />;

  const currentStepIdx = WORKFLOW_STEPS.indexOf(session.workflowStatus);
  const gallery = data?.galleries?.[0];
  const hasGallery = !!gallery?.gallery_link || !!gallery?.retouched_link;

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

        {/* 진행 타임라인 */}
        <PortalCard style={{ marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:800, color:G, marginBottom:16 }}>촬영 진행 단계</div>
          <div style={{ display:"flex", overflowX:"auto", gap:0, paddingBottom:4 }}>
            {WORKFLOW_STEPS.map((step, i) => {
              const done = i < currentStepIdx;
              const cur  = i === currentStepIdx;
              return (
                <div key={step} style={{ flex:"0 0 auto", display:"flex", flexDirection:"column", alignItems:"center", minWidth:72 }}>
                  <div style={{ display:"flex", alignItems:"center", width:"100%" }}>
                    {i > 0 && <div style={{ flex:1, height:2, background:done||cur?G:"#E8E4DF" }} />}
                    <div style={{ width:28, height:28, borderRadius:"50%", background:cur?OR:done?G:"#E8E4DF", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, flexShrink:0, transition:"all .3s" }}>
                      {done ? "✓" : i+1}
                    </div>
                    {i < WORKFLOW_STEPS.length-1 && <div style={{ flex:1, height:2, background:done?G:"#E8E4DF" }} />}
                  </div>
                  <div style={{ fontSize:9, color:cur?OR:done?G:MUT, fontWeight:cur||done?700:400, marginTop:4, textAlign:"center", lineHeight:1.3, maxWidth:64 }}>{step}</div>
                </div>
              );
            })}
          </div>
          {currentStepIdx >= 0 && (
            <div style={{ marginTop:14, padding:"10px 14px", background:`${OR}10`, borderRadius:10, borderLeft:`3px solid ${OR}` }}>
              <span style={{ fontSize:11, fontWeight:700, color:OR }}>현재 단계: {session.workflowStatus}</span>
              {currentStepIdx < WORKFLOW_STEPS.length-1 && (
                <span style={{ fontSize:11, color:MUT, marginLeft:8 }}>→ 다음: {WORKFLOW_STEPS[currentStepIdx+1]}</span>
              )}
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
            <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>{gallery.title || "촬영 갤러리"}</div>
            {gallery.shoot_date && <div style={{ fontSize:12, color:MUT, marginBottom:10 }}>촬영일: {new Date(gallery.shoot_date).toLocaleDateString("ko-KR")}</div>}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {gallery.gallery_link && <a href={gallery.gallery_link} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:700, color:"#fff", background:G, borderRadius:8, padding:"7px 14px", textDecoration:"none" }}>갤러리 열기</a>}
              {gallery.retouched_link && <a href={gallery.retouched_link} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:700, color:G, background:`${G}15`, borderRadius:8, padding:"7px 14px", textDecoration:"none" }}>보정본 보기</a>}
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
