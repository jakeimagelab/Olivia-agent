"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };
const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"0 12px", height:40, fontSize:13, outline:"none", background:C.white, color:C.txt, fontFamily:"inherit", boxSizing:"border-box" };

export default function PerDonationsPage() {
  const [donations, setDonations] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clients,   setClients]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState({ clientId:"", campaignId:"", points:"", hospitalNamePublic:true, displayName:"" });
  const [saving,    setSaving]    = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/per/donations").then(r => r.json()),
      fetch("/api/per/campaigns?status=active").then(r => r.json()),
      fetch("/api/per/clients").then(r => r.json()),
    ]).then(([d, c, cl]) => {
      setDonations(d.donations ?? []);
      setCampaigns(c.campaigns ?? []);
      setClients(cl.clients ?? []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDonate = async () => {
    setSaving(true);
    const r = await fetch("/api/per/donations", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ clientId:form.clientId, campaignId:form.campaignId||null, points:Number(form.points), hospitalNamePublic:form.hospitalNamePublic, displayName:form.displayName }),
    });
    const d = await r.json();
    if (!d.ok) alert(d.error);
    setSaving(false);
    setModal(false);
    load();
  };

  const selectedClient = clients.find(c => c.id === form.clientId);

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">기부 내역</span>
          </div>
        </div>
        <div className="pc-header-actions">
          <button onClick={() => { setForm({ clientId:"", campaignId:"", points:"", hospitalNamePublic:true, displayName:"" }); setModal(true); }}
            className="pc-btn pc-btn--primary pc-btn--sm">
            <Plus size={13}/> 기부 등록
          </button>
        </div>
      </header>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px 100px" }}>
        {loading ? <div style={{ textAlign:"center", padding:40, color:C.hint }}>로딩 중...</div> :
          donations.length === 0
            ? <div style={{ background:C.white, borderRadius:12, padding:40, textAlign:"center", color:C.hint }}>기부 내역이 없습니다.</div>
            : donations.map((d:any) => (
              <div key={d.id} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"16px 20px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{d.display_name ?? d.clients?.name}</div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{d.donation_campaigns?.title ?? "개별 기부"}</div>
                  <div style={{ fontSize:11, color:C.hint, marginTop:2 }}>{new Date(d.created_at).toLocaleDateString("ko-KR")} · {d.hospital_name_public?"병원명 공개":"비공개"}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:18, fontWeight:800, color:"#7C3AED" }}>{d.points?.toLocaleString()}P</div>
                  <span style={{ fontSize:10, background:d.status==="confirmed"?"#F0FDF4":"#FFF7ED", color:d.status==="confirmed"?C.green:C.orange, borderRadius:4, padding:"2px 7px", fontWeight:700 }}>
                    {d.status==="confirmed"?"확인 완료":"대기"}
                  </span>
                </div>
              </div>
            ))
        }
      </div>

      {/* 기부 등록 모달 */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setModal(false)}>
          <div style={{ background:C.white, borderRadius:16, padding:28, width:400, maxWidth:"95vw" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin:"0 0 20px", fontSize:16, fontWeight:800 }}>기부 등록</h2>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>병원 선택</label>
              <select value={form.clientId} onChange={e => { const c = clients.find(cl => cl.id===e.target.value); setForm(f => ({ ...f, clientId:e.target.value, displayName:c?.name??"" })); }} style={iS}>
                <option value="">병원 선택...</option>
                {clients.map((c:any) => <option key={c.id} value={c.id}>{c.name} ({c.available_points?.toLocaleString()}P)</option>)}
              </select>
              {selectedClient && <div style={{ fontSize:11, color:C.green, marginTop:3 }}>사용 가능 포인트: {selectedClient.available_points?.toLocaleString()}P</div>}
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>기부 캠페인 (선택)</label>
              <select value={form.campaignId} onChange={e => setForm(f => ({ ...f, campaignId:e.target.value }))} style={iS}>
                <option value="">개별 기부 (캠페인 없음)</option>
                {campaigns.map((c:any) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>기부 포인트</label>
              <input type="number" value={form.points} onChange={e => setForm(f => ({ ...f, points:e.target.value }))} placeholder="예: 10000" style={iS} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>리포트 표시 이름</label>
              <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName:e.target.value }))} placeholder="병원명 또는 별칭" style={iS} />
            </div>
            <div style={{ marginBottom:20, display:"flex", alignItems:"center", gap:8 }}>
              <input type="checkbox" id="pub" checked={form.hospitalNamePublic} onChange={e => setForm(f => ({ ...f, hospitalNamePublic:e.target.checked }))} />
              <label htmlFor="pub" style={{ fontSize:13, fontWeight:600 }}>기부 리포트에 병원명 공개</label>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setModal(false)} style={{ flex:1, background:C.light, color:C.muted, border:"none", borderRadius:8, padding:12, fontWeight:700, cursor:"pointer" }}>취소</button>
              <button onClick={handleDonate} disabled={saving||!form.clientId||!form.points}
                style={{ flex:2, background:"#7C3AED", color:"#fff", border:"none", borderRadius:8, padding:12, fontWeight:700, cursor:"pointer", opacity:(saving||!form.clientId||!form.points)?.5:1 }}>
                {saving?"기부 처리 중...":"기부 등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
