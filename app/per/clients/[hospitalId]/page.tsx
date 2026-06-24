"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { TIER_LABEL, TIER_COLOR, TX_TYPE_LABEL, TX_TYPE_COLOR, ORDER_STATUS_LABEL, calculateRewardPoints } from "@/lib/per";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };

const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"0 12px", height:40, fontSize:13, outline:"none", background:C.white, color:C.txt, fontFamily:"inherit", boxSizing:"border-box" };

export default function PerClientDetail({ params }: { params: Promise<{ hospitalId: string }> }) {
  const { hospitalId } = use(params);
  const [data, setData]       = useState<any>(null);
  const [txFilter, setTxFilter] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [adjForm, setAdjForm] = useState({ action:"earn", amount:"", points:"", memo:"" });
  const [saving,  setSaving]  = useState(false);
  const [tab,     setTab]     = useState<"tx"|"orders"|"donations">("tx");

  const load = () => {
    setLoading(true);
    fetch(`/api/per/clients?id=${hospitalId}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [hospitalId]);

  const handleAdjust = async () => {
    if (!adjForm.action) return;
    setSaving(true);
    const pts = adjForm.points
      ? Number(adjForm.points)
      : calculateRewardPoints(Number(adjForm.amount.replace(/,/g, "")));
    await fetch("/api/per/clients", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ clientId:hospitalId, action:adjForm.action, points:pts, amount:Number(adjForm.amount.replace(/,/g,"")||0), memo:adjForm.memo, sourceType:"manual" }),
    });
    setSaving(false);
    setAdjForm({ action:"earn", amount:"", points:"", memo:"" });
    load();
  };

  if (loading) return <div style={{ padding:40, textAlign:"center", color:C.hint }}>로딩 중...</div>;
  if (!data?.client) return <div style={{ padding:40, textAlign:"center", color:C.hint }}>병원 정보를 찾을 수 없습니다.</div>;

  const { client, transactions, orders, donations } = data;
  const filteredTx = txFilter === "전체" ? transactions : transactions.filter((t:any) => t.type === txFilter);

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href="/" className="pc-header-back">← 관리자 홈</Link>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">{client.name}</span>
          </div>
        </div>
        <div className="pc-header-actions">
          <Link href="/per/clients" style={{ display:"flex", alignItems:"center", height:36, padding:"0 14px", border:`1px solid ${C.border}`, borderRadius:9, background:C.light, color:C.teal, fontWeight:700, fontSize:13, textDecoration:"none" }}>
            ← 병원 목록
          </Link>
          <span style={{ background:TIER_COLOR[client.reward_tier ?? "standard"], color:"#fff", borderRadius:20, padding:"4px 14px", fontWeight:800, fontSize:12 }}>
            {TIER_LABEL[client.reward_tier ?? "standard"]} 등급
          </span>
        </div>
      </header>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px 100px" }}>
        {/* 포인트 요약 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:24 }}>
          {[
            { l:"사용 가능", v:(client.available_points??0).toLocaleString()+"P", c:C.green },
            { l:"누적 적립", v:(client.total_earned_points??0).toLocaleString()+"P", c:C.teal },
            { l:"사용 완료", v:(client.total_used_points??0).toLocaleString()+"P", c:C.orange },
            { l:"기부 참여", v:(client.total_donated_points??0).toLocaleString()+"P", c:"#7C3AED" },
            { l:"누적 촬영금액", v:((client.total_paid_amount??0)/10000).toFixed(0)+"만원", c:C.muted },
          ].map(s => (
            <div key={s.l} style={{ background:C.white, borderRadius:10, padding:"14px 16px", border:`1px solid ${C.border}`, textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:C.hint, marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20 }}>
          {/* 내역 탭 */}
          <div>
            <div style={{ display:"flex", gap:0, marginBottom:12, background:C.light, borderRadius:8, padding:3, width:"fit-content" }}>
              {(["tx","orders","donations"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ padding:"6px 16px", border:"none", borderRadius:6, fontWeight:700, fontSize:12, cursor:"pointer", background:tab===t?C.white:"transparent", color:tab===t?C.teal:C.muted, transition:"all .15s" }}>
                  {t==="tx"?"포인트 내역":t==="orders"?"제품 신청":"기부 내역"}
                </button>
              ))}
            </div>

            {tab === "tx" && (
              <>
                <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                  {["전체","earn","use","donate","adjust","expire","cancel"].map(f => (
                    <button key={f} onClick={() => setTxFilter(f)}
                      style={{ padding:"4px 12px", border:`1px solid ${txFilter===f?C.teal:C.border}`, borderRadius:20, background:txFilter===f?C.teal:"transparent", color:txFilter===f?"#fff":C.muted, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                      {TX_TYPE_LABEL[f] ?? f}
                    </button>
                  ))}
                </div>
                {filteredTx.length === 0 ? (
                  <div style={{ background:C.white, borderRadius:10, padding:20, textAlign:"center", color:C.hint, fontSize:13 }}>내역이 없습니다</div>
                ) : filteredTx.map((tx:any) => (
                  <div key={tx.id} style={{ background:C.white, borderRadius:10, border:`1px solid ${C.border}`, padding:"12px 16px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <span style={{ fontSize:11, background:`${TX_TYPE_COLOR[tx.type]}22`, color:TX_TYPE_COLOR[tx.type], borderRadius:4, padding:"2px 7px", fontWeight:700 }}>{TX_TYPE_LABEL[tx.type]??tx.type}</span>
                      <span style={{ fontSize:12, color:C.muted, marginLeft:8 }}>{tx.memo||"—"}</span>
                      <div style={{ fontSize:11, color:C.hint, marginTop:2 }}>{new Date(tx.created_at).toLocaleDateString("ko-KR")} · 잔액 {tx.balance_after?.toLocaleString()}P</div>
                    </div>
                    <span style={{ fontWeight:800, fontSize:15, color:tx.points>0?C.green:C.orange }}>{tx.points>0?"+":""}{tx.points?.toLocaleString()}P</span>
                  </div>
                ))}
              </>
            )}

            {tab === "orders" && (
              orders.length === 0
                ? <div style={{ background:C.white, borderRadius:10, padding:20, textAlign:"center", color:C.hint, fontSize:13 }}>제품 신청 내역이 없습니다</div>
                : orders.map((o:any) => (
                  <div key={o.id} style={{ background:C.white, borderRadius:10, border:`1px solid ${C.border}`, padding:"14px 16px", marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontWeight:700, fontSize:13 }}>{o.reward_products?.name ?? "제품"}</span>
                      <span style={{ fontSize:11, background:`${C.orange}20`, color:C.orange, borderRadius:4, padding:"2px 8px", fontWeight:700 }}>{ORDER_STATUS_LABEL[o.status]??o.status}</span>
                    </div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>수량: {o.quantity} · 사용 포인트: {o.used_points?.toLocaleString()}P</div>
                    <div style={{ fontSize:11, color:C.hint, marginTop:2 }}>{new Date(o.created_at).toLocaleDateString("ko-KR")}</div>
                  </div>
                ))
            )}

            {tab === "donations" && (
              donations.length === 0
                ? <div style={{ background:C.white, borderRadius:10, padding:20, textAlign:"center", color:C.hint, fontSize:13 }}>기부 내역이 없습니다</div>
                : donations.map((d:any) => (
                  <div key={d.id} style={{ background:C.white, borderRadius:10, border:`1px solid ${C.border}`, padding:"14px 16px", marginBottom:8 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{d.donation_campaigns?.title ?? "기부"}</div>
                    <div style={{ fontSize:12, color:"#7C3AED", marginTop:4, fontWeight:700 }}>{d.points?.toLocaleString()}P 기부</div>
                    <div style={{ fontSize:11, color:C.hint, marginTop:2 }}>{new Date(d.created_at).toLocaleDateString("ko-KR")} · {d.hospital_name_public?"병원명 공개":"비공개"}</div>
                  </div>
                ))
            )}
          </div>

          {/* 수동 포인트 조정 */}
          <div>
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:"20px" }}>
              <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:800, color:C.txt }}>포인트 수동 처리</h3>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>처리 유형</label>
                <select value={adjForm.action} onChange={e => setAdjForm(f => ({ ...f, action:e.target.value }))} style={iS}>
                  <option value="earn">적립 (촬영 금액 기준)</option>
                  <option value="adjust">포인트 조정 (직접 입력)</option>
                  <option value="cancel">포인트 회수</option>
                  <option value="expire">만료 처리</option>
                </select>
              </div>
              {adjForm.action === "earn" ? (
                <div style={{ marginBottom:10 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>촬영/결제 금액 (원)</label>
                  <input type="number" value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount:e.target.value }))} placeholder="예: 2000000" style={iS} />
                  {adjForm.amount && <div style={{ fontSize:11, color:C.green, marginTop:3 }}>→ {calculateRewardPoints(Number(adjForm.amount)).toLocaleString()}P 적립</div>}
                </div>
              ) : (
                <div style={{ marginBottom:10 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>포인트 수량</label>
                  <input type="number" value={adjForm.points} onChange={e => setAdjForm(f => ({ ...f, points:e.target.value }))} placeholder="예: 5000" style={iS} />
                </div>
              )}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>메모</label>
                <input value={adjForm.memo} onChange={e => setAdjForm(f => ({ ...f, memo:e.target.value }))} placeholder="처리 사유" style={iS} />
              </div>
              <button onClick={handleAdjust} disabled={saving}
                style={{ width:"100%", background:C.teal, color:"#fff", border:"none", borderRadius:8, padding:12, fontWeight:700, fontSize:13, cursor:"pointer", opacity:saving?.5:1 }}>
                {saving?"처리 중...":"포인트 처리"}
              </button>
            </div>

            {/* PER 리포트 */}
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:"20px", marginTop:14 }}>
              <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800, color:C.txt }}>PER 리포트</h3>
              <p style={{ fontSize:12, color:C.muted, margin:"0 0 14px" }}>병원별 리워드 활동 리포트를 생성하고 메일링함에 저장합니다.</p>
              <button onClick={async () => {
                const r = await fetch("/api/per/reports", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ type:"client", clientId:hospitalId }) });
                const d = await r.json();
                if (d.ok) { alert(d.message); if (d.html) window.open("data:text/html;charset=utf-8,"+encodeURIComponent(d.html)); }
                else alert(d.error);
              }} style={{ width:"100%", background:C.light, color:C.teal, border:`1px solid ${C.teal}30`, borderRadius:8, padding:10, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                리포트 생성 + 메일링함 저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
