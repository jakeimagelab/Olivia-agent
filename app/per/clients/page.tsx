"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, Plus, ChevronRight, Award } from "lucide-react";
import { TIER_LABEL, TIER_COLOR, calculateRewardPoints } from "@/lib/per";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };

export default function PerClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [nonPer,  setNonPer]  = useState<any[]>([]);
  const [q, setQ]             = useState("");
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm]   = useState({ clientId:"", amount:"", memo:"" });
  const [saving, setSaving]     = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/per/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(r => r.json()),
      fetch("/api/clients").then(r => r.json()),
    ]).then(([perD, allD]) => {
      setClients(perD.clients ?? []);
      const perIds = new Set((perD.clients ?? []).map((c:any) => c.id));
      setNonPer((allD.clients ?? []).filter((c:any) => !perIds.has(c.id)).slice(0, 20));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [q]);

  const handleAddPoints = async () => {
    if (!addForm.clientId || !addForm.amount) return;
    setSaving(true);
    const pts = calculateRewardPoints(Number(addForm.amount.replace(/,/g, "")));
    await fetch("/api/per/clients", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ clientId:addForm.clientId, action:"earn", points:pts, amount:Number(addForm.amount.replace(/,/g,"")), memo:addForm.memo, sourceType:"manual" }),
    });
    setSaving(false);
    setAddModal(false);
    setAddForm({ clientId:"", amount:"", memo:"" });
    load();
  };

  const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"0 12px", height:40, fontSize:13, outline:"none", background:C.white, color:C.txt, fontFamily:"inherit", boxSizing:"border-box" };

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">병원별 포인트 관리</span>
          </div>
        </div>
        <div className="pc-header-actions">
          <button onClick={() => setAddModal(true)} className="pc-btn pc-btn--orange pc-btn--sm">
            <Plus size={13}/> 포인트 적립
          </button>
        </div>
      </header>

      <div style={{ maxWidth:920, margin:"0 auto", padding:"24px 20px 100px" }}>
        <div style={{ position:"relative", marginBottom:20 }}>
          <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.hint }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="병원명 검색..." style={{ ...iS, paddingLeft:34, height:42 }} />
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:40, color:C.hint }}>로딩 중...</div>
        ) : (
          <>
            {/* PER 참여 병원 */}
            <div style={{ fontWeight:700, fontSize:13, color:C.teal, marginBottom:10 }}>PER 참여 병원 ({clients.length}곳)</div>
            {clients.length === 0 && <div style={{ background:C.white, borderRadius:12, padding:24, textAlign:"center", color:C.hint, fontSize:13, marginBottom:20 }}>PER 참여 병원이 없습니다. 포인트를 적립하면 자동으로 등록됩니다.</div>}
            {clients.map((c: any) => (
              <Link key={c.id} href={`/per/clients/${c.id}`} style={{ textDecoration:"none" }}>
                <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"16px 20px", marginBottom:10, display:"flex", alignItems:"center", gap:12, transition:"box-shadow .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(21,88,85,.1)")}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                      <span style={{ fontWeight:800, fontSize:14, color:C.txt }}>{c.name}</span>
                      <span style={{ fontSize:10, background:`${TIER_COLOR[c.reward_tier]}22`, color:TIER_COLOR[c.reward_tier], borderRadius:12, padding:"2px 8px", fontWeight:700 }}>
                        {TIER_LABEL[c.reward_tier ?? "standard"]}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:C.muted }}>{c.manager_name ?? "—"}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:18, fontWeight:800, color:C.green }}>{(c.available_points ?? 0).toLocaleString()}P</div>
                    <div style={{ fontSize:11, color:C.hint }}>사용 가능</div>
                  </div>
                  <div style={{ textAlign:"right", minWidth:80 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.teal }}>{(c.total_earned_points ?? 0).toLocaleString()}P</div>
                    <div style={{ fontSize:11, color:C.hint }}>누적 적립</div>
                  </div>
                  <div style={{ textAlign:"right", minWidth:90 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.muted }}>{(c.total_paid_amount ?? 0).toLocaleString()}원</div>
                    <div style={{ fontSize:11, color:C.hint }}>누적 촬영 금액</div>
                  </div>
                  <ChevronRight size={16} color={C.hint} />
                </div>
              </Link>
            ))}

            {/* 미참여 병원 */}
            {!q && nonPer.length > 0 && (
              <>
                <div style={{ fontWeight:700, fontSize:13, color:C.hint, margin:"20px 0 10px" }}>PER 미참여 병원 (포인트 적립 시 자동 등록)</div>
                {nonPer.map((c: any) => (
                  <div key={c.id} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.light}`, padding:"12px 20px", marginBottom:8, display:"flex", alignItems:"center", gap:12, opacity:.7 }}>
                    <div style={{ flex:1, fontSize:13, fontWeight:600, color:C.muted }}>{c.name}</div>
                    <button onClick={() => { setAddForm(f => ({ ...f, clientId:c.id })); setAddModal(true); }}
                      className="pc-btn pc-btn--ghost pc-btn--sm">
                      포인트 적립
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* 포인트 적립 모달 */}
      {addModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setAddModal(false)}>
          <div style={{ background:C.white, borderRadius:16, padding:28, width:360, maxWidth:"90vw" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin:"0 0 20px", fontSize:16, fontWeight:800 }}>포인트 적립</h2>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>병원 선택</label>
              <select value={addForm.clientId} onChange={e => setAddForm(f => ({ ...f, clientId:e.target.value }))} style={{ ...iS }}>
                <option value="">병원 선택...</option>
                {[...clients, ...nonPer].map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>촬영/결제 금액 (원)</label>
              <input type="number" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount:e.target.value }))} placeholder="예: 2000000" style={iS} />
              {addForm.amount && <div style={{ fontSize:11, color:C.green, marginTop:4 }}>→ {calculateRewardPoints(Number(addForm.amount)).toLocaleString()}P 적립 예정 (1%)</div>}
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>메모</label>
              <input value={addForm.memo} onChange={e => setAddForm(f => ({ ...f, memo:e.target.value }))} placeholder="예: 2026년 상반기 촬영 금액" style={iS} />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setAddModal(false)} style={{ flex:1, background:C.light, color:C.muted, border:"none", borderRadius:8, padding:12, fontWeight:700, cursor:"pointer" }}>취소</button>
              <button onClick={handleAddPoints} disabled={saving || !addForm.clientId || !addForm.amount}
                style={{ flex:2, background:C.teal, color:"#fff", border:"none", borderRadius:8, padding:12, fontWeight:700, cursor:"pointer", opacity:(saving||!addForm.clientId||!addForm.amount)?0.5:1 }}>
                {saving ? "적립 중..." : "포인트 적립"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
