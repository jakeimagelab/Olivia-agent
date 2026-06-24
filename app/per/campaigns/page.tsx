"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Heart } from "lucide-react";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/per";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };
const STATUS_COLOR: Record<string,string> = { draft:C.hint, active:C.green, closed:C.orange, donated:"#7C3AED", reported:C.teal };
const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"0 12px", height:40, fontSize:13, outline:"none", background:C.white, color:C.txt, fontFamily:"inherit", boxSizing:"border-box" };
const taS: React.CSSProperties = { ...iS, height:"auto", padding:"10px 12px", resize:"vertical" };

export default function PerCampaignsPage() {
  const [camps,   setCamps]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form,    setForm]    = useState({ title:"", periodLabel:"", startDate:"", endDate:"", donationTarget:"", description:"", goalAmount:"" });
  const [saving,  setSaving]  = useState(false);
  const [detail,  setDetail]  = useState<any>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/per/campaigns").then(r => r.json()).then(d => setCamps(d.campaigns ?? [])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const loadDetail = (id: string) => {
    fetch(`/api/per/campaigns?id=${id}`).then(r => r.json()).then(d => { if (d.ok) setDetail(d); });
  };

  const handleSave = async () => {
    setSaving(true);
    if (editing) {
      await fetch("/api/per/campaigns", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:editing.id, title:form.title, period_label:form.periodLabel, start_date:form.startDate||null, end_date:form.endDate||null, donation_target:form.donationTarget, description:form.description, goal_amount:Number(form.goalAmount)||0 }) });
    } else {
      await fetch("/api/per/campaigns", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ title:form.title, periodLabel:form.periodLabel, startDate:form.startDate||null, endDate:form.endDate||null, donationTarget:form.donationTarget, description:form.description, goalAmount:Number(form.goalAmount)||0 }) });
    }
    setSaving(false);
    setModal(false);
    load();
  };

  const changeStatus = async (id: string, status: string) => {
    await fetch("/api/per/campaigns", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id, status }) });
    load();
    if (detail?.campaign?.id === id) loadDetail(id);
  };

  const generateReport = async (id: string) => {
    const r = await fetch("/api/per/reports", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ type:"campaign", campaignId:id }) });
    const d = await r.json();
    if (d.ok) { alert(d.message); if (d.html) window.open("data:text/html;charset=utf-8,"+encodeURIComponent(d.html)); }
    else alert(d.error);
  };

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href="/" className="pc-header-back">← 관리자 홈</Link>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">기부 캠페인</span>
          </div>
        </div>
        <div className="pc-header-actions">
          <button onClick={() => { setEditing(null); setForm({ title:"", periodLabel:"", startDate:"", endDate:"", donationTarget:"", description:"", goalAmount:"" }); setModal(true); }}
            style={{ display:"flex", alignItems:"center", gap:6, height:36, padding:"0 14px", border:"none", borderRadius:9, background:C.teal, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            <Plus size={13}/> 캠페인 생성
          </button>
        </div>
      </header>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"24px 20px 100px", display:"grid", gridTemplateColumns:"1fr 340px", gap:20 }}>
        {/* 캠페인 목록 */}
        <div>
          {loading ? <div style={{ textAlign:"center", padding:40, color:C.hint }}>로딩 중...</div> :
            camps.length === 0
              ? <div style={{ background:C.white, borderRadius:12, padding:40, textAlign:"center", color:C.hint }}>등록된 캠페인이 없습니다.</div>
              : camps.map((c: any) => (
                <div key={c.id} onClick={() => loadDetail(c.id)}
                  style={{ background:C.white, borderRadius:14, border:`1.5px solid ${detail?.campaign?.id===c.id?C.teal:C.border}`, padding:"18px 20px", marginBottom:12, cursor:"pointer", transition:"box-shadow .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow="0 4px 12px rgba(21,88,85,.1)")}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow="none")}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:15 }}>{c.title}</div>
                      <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{c.period_label} · {c.donation_target}</div>
                    </div>
                    <span style={{ fontSize:11, background:`${STATUS_COLOR[c.status]}20`, color:STATUS_COLOR[c.status], borderRadius:4, padding:"3px 10px", fontWeight:700 }}>{CAMPAIGN_STATUS_LABEL[c.status]??c.status}</span>
                  </div>
                  <div style={{ display:"flex", gap:16 }}>
                    <div><span style={{ fontSize:18, fontWeight:800, color:"#7C3AED" }}>{(c.current_points??0).toLocaleString()}P</span><span style={{ fontSize:11, color:C.hint, marginLeft:4 }}>모금</span></div>
                    <div><span style={{ fontSize:15, fontWeight:700, color:C.teal }}>{c.participant_count??0}곳</span><span style={{ fontSize:11, color:C.hint, marginLeft:4 }}>참여</span></div>
                  </div>
                  <div style={{ display:"flex", gap:6, marginTop:12 }}>
                    <button onClick={e => { e.stopPropagation(); setEditing(c); setForm({ title:c.title, periodLabel:c.period_label, startDate:c.start_date??"", endDate:c.end_date??"", donationTarget:c.donation_target, description:c.description, goalAmount:String(c.goal_amount??0) }); setModal(true); }}
                      style={{ background:C.light, color:C.teal, border:"none", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>수정</button>
                    {c.status === "draft"   && <button onClick={e => { e.stopPropagation(); changeStatus(c.id,"active"); }} style={{ background:"#F0FDF4", color:C.green, border:"none", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>캠페인 시작</button>}
                    {c.status === "active"  && <button onClick={e => { e.stopPropagation(); changeStatus(c.id,"closed"); }} style={{ background:"#FFF7ED", color:C.orange, border:"none", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>마감</button>}
                    {c.status === "closed"  && <button onClick={e => { e.stopPropagation(); changeStatus(c.id,"donated"); }} style={{ background:"#F5F3FF", color:"#7C3AED", border:"none", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>기부 완료</button>}
                    {(c.status === "donated"||c.status === "closed") && <button onClick={e => { e.stopPropagation(); generateReport(c.id); }} style={{ background:C.light, color:C.teal, border:"none", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>리포트 생성</button>}
                  </div>
                </div>
              ))
          }
        </div>

        {/* 캠페인 상세 */}
        <div>
          {detail ? (
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:"20px", position:"sticky", top:20 }}>
              <h3 style={{ margin:"0 0 4px", fontSize:15, fontWeight:800 }}>{detail.campaign?.title}</h3>
              <p style={{ fontSize:12, color:C.muted, margin:"0 0 16px" }}>{detail.campaign?.description}</p>
              <div style={{ fontWeight:700, fontSize:12, color:C.muted, marginBottom:10 }}>참여 병원 ({(detail.records??[]).length}곳)</div>
              {(detail.records ?? []).length === 0
                ? <div style={{ fontSize:13, color:C.hint, textAlign:"center", padding:20 }}>참여 병원이 없습니다</div>
                : (detail.records ?? []).map((r:any) => (
                  <div key={r.id} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${C.light}` }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{r.display_name ?? r.clients?.name}</div>
                      <div style={{ fontSize:11, color:C.hint }}>{r.hospital_name_public?"공개":"비공개"}</div>
                    </div>
                    <span style={{ fontWeight:800, fontSize:13, color:"#7C3AED" }}>{r.points?.toLocaleString()}P</span>
                  </div>
                ))
              }
            </div>
          ) : (
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:24, textAlign:"center", color:C.hint, fontSize:13 }}>
              <Heart size={28} style={{ marginBottom:8, opacity:.3 }} /><br/>캠페인을 선택하면 참여 병원 목록이 표시됩니다.
            </div>
          )}
        </div>
      </div>

      {/* 캠페인 생성/수정 모달 */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setModal(false)}>
          <div style={{ background:C.white, borderRadius:16, padding:28, width:440, maxWidth:"95vw" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin:"0 0 20px", fontSize:16, fontWeight:800 }}>{editing?"캠페인 수정":"캠페인 생성"}</h2>
            {[
              { label:"캠페인명", key:"title" },
              { label:"기간 표시 (예: 2026년 상반기)", key:"periodLabel" },
              { label:"기부처", key:"donationTarget" },
              { label:"시작일", key:"startDate", type:"date" },
              { label:"마감일", key:"endDate", type:"date" },
              { label:"목표 금액 (원)", key:"goalAmount", type:"number" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>{f.label}</label>
                <input type={f.type??"text"} value={(form as any)[f.key]} onChange={e => setForm((p:any) => ({ ...p, [f.key]:e.target.value }))} style={iS} />
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>캠페인 설명</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description:e.target.value }))} rows={3} style={taS} />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setModal(false)} style={{ flex:1, background:C.light, color:C.muted, border:"none", borderRadius:8, padding:12, fontWeight:700, cursor:"pointer" }}>취소</button>
              <button onClick={handleSave} disabled={saving} style={{ flex:2, background:C.teal, color:"#fff", border:"none", borderRadius:8, padding:12, fontWeight:700, cursor:"pointer", opacity:saving?.5:1 }}>{saving?"저장 중...":"저장"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
