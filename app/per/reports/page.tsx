"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart2, FileText } from "lucide-react";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };

export default function PerReportsPage() {
  const [reports,   setReports]   = useState<any[]>([]);
  const [clients,   setClients]   = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selClient, setSelClient] = useState("");
  const [selCamp,   setSelCamp]   = useState("");
  const [busy,      setBusy]      = useState(false);

  const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"0 12px", height:40, fontSize:13, outline:"none", background:C.white, color:C.txt, fontFamily:"inherit", boxSizing:"border-box" };

  useEffect(() => {
    Promise.all([
      fetch("/api/per/reports").then(r => r.json()),
      fetch("/api/per/clients").then(r => r.json()),
      fetch("/api/per/campaigns").then(r => r.json()),
    ]).then(([rr, cr, camr]) => {
      setReports(rr.reports ?? []);
      setClients(cr.clients ?? []);
      setCampaigns(camr.campaigns ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const generate = async (type: string, id: string) => {
    setBusy(true);
    const body = type === "client" ? { type, clientId:id } : { type, campaignId:id };
    const r = await fetch("/api/per/reports", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    const d = await r.json();
    setBusy(false);
    if (d.ok) {
      alert(d.message);
      if (d.html) window.open("data:text/html;charset=utf-8,"+encodeURIComponent(d.html));
      fetch("/api/per/reports").then(r => r.json()).then(d => setReports(d.reports ?? []));
    } else alert(d.error);
  };

  const REPORT_TYPE_LABEL: Record<string,string> = { client:"병원별", campaign:"캠페인", overall:"전체 운영" };

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">PER 리포트</span>
          </div>
        </div>
        <div className="pc-header-actions" />
      </header>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px 100px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:28 }}>
          {/* 병원별 리포트 생성 */}
          <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <FileText size={16} color={C.teal}/>
              <span style={{ fontWeight:800, fontSize:14 }}>병원별 PER 리포트</span>
            </div>
            <select value={selClient} onChange={e => setSelClient(e.target.value)} style={{ ...iS, marginBottom:12 }}>
              <option value="">병원 선택...</option>
              {clients.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => selClient && generate("client", selClient)} disabled={!selClient || busy}
              className="pc-btn pc-btn--primary" style={{ width:"100%" }}>
              {busy?"생성 중...":"리포트 생성 + 메일링함 저장"}
            </button>
            <p style={{ fontSize:11, color:C.hint, margin:"10px 0 0", lineHeight:1.6 }}>누적 포인트, 제품 신청, 기부 내역이 포함된 HTML 리포트를 생성하고 올리비아 메일링함에 자동 저장합니다.</p>
          </div>

          {/* 캠페인 리포트 생성 */}
          <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <BarChart2 size={16} color="#7C3AED"/>
              <span style={{ fontWeight:800, fontSize:14 }}>반기별 기부 캠페인 리포트</span>
            </div>
            <select value={selCamp} onChange={e => setSelCamp(e.target.value)} style={{ ...iS, marginBottom:12 }}>
              <option value="">캠페인 선택...</option>
              {campaigns.map((c:any) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <button onClick={() => selCamp && generate("campaign", selCamp)} disabled={!selCamp || busy}
              style={{ width:"100%", background:selCamp?"#7C3AED":C.light, color:selCamp?"#fff":C.hint, border:"none", borderRadius:8, padding:10, fontWeight:700, fontSize:13, cursor:selCamp?"pointer":"not-allowed", transition:"all .15s" }}>
              {busy?"생성 중...":"기부 리포트 생성 + 메일링함 저장"}
            </button>
            <p style={{ fontSize:11, color:C.hint, margin:"10px 0 0", lineHeight:1.6 }}>참여 병원 명단, 총 기부 포인트, SNS용 요약 문구가 포함된 리포트를 생성합니다.</p>
          </div>
        </div>

        {/* 생성된 리포트 목록 */}
        <div style={{ fontWeight:700, fontSize:13, color:C.muted, marginBottom:10 }}>생성된 리포트 ({reports.length}개)</div>
        {loading ? <div style={{ textAlign:"center", padding:20, color:C.hint }}>로딩 중...</div> :
          reports.length === 0
            ? <div style={{ background:C.white, borderRadius:12, padding:32, textAlign:"center", color:C.hint, fontSize:13 }}>생성된 리포트가 없습니다.</div>
            : reports.map((r:any) => (
              <div key={r.id} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"14px 20px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:10, background:`${C.teal}15`, color:C.teal, borderRadius:4, padding:"2px 7px", fontWeight:700 }}>{REPORT_TYPE_LABEL[r.report_type]}</span>
                    <span style={{ fontWeight:700, fontSize:13 }}>{r.title}</span>
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>{r.summary}</div>
                  <div style={{ fontSize:11, color:C.hint, marginTop:2 }}>{new Date(r.created_at).toLocaleDateString("ko-KR")} · {r.mailing_queue_id ? "✓ 메일링함 저장됨" : "메일링 미연동"}</div>
                </div>
                {r.html_content && (
                  <button onClick={() => window.open("data:text/html;charset=utf-8,"+encodeURIComponent(r.html_content))}
                    style={{ background:C.light, color:C.teal, border:"none", borderRadius:7, padding:"7px 14px", fontWeight:700, fontSize:12, cursor:"pointer", whiteSpace:"nowrap" }}>
                    미리보기
                  </button>
                )}
              </div>
            ))
        }
      </div>
    </main>
  );
}
