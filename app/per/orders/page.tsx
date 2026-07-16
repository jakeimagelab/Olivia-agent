"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ORDER_STATUS_LABEL } from "@/lib/per";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };
const STATUS_COLOR: Record<string,string> = { pending:C.orange, approved:C.teal, points_deducted:C.teal, preparing:"#7C3AED", shipped:"#0891B2", completed:C.green, canceled:C.hint, rejected:"#EF4444" };
const NEXT_STATUS: Record<string,string> = { pending:"approved", approved:"preparing", preparing:"shipped", shipped:"completed" };
const NEXT_LABEL: Record<string,string>  = { pending:"승인 (포인트 차감)", approved:"준비 중으로 변경", preparing:"배송 중으로 변경", shipped:"완료 처리" };

export default function PerOrdersPage() {
  const [orders,  setOrders]  = useState<any[]>([]);
  const [statusF, setStatusF] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [memo,    setMemo]    = useState<Record<string,string>>({});
  const [busy,    setBusy]    = useState<string|null>(null);

  const load = () => {
    setLoading(true);
    const p = statusF !== "전체" ? `?status=${statusF}` : "";
    fetch(`/api/per/orders${p}`).then(r => r.json()).then(d => setOrders(d.orders ?? [])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusF]);

  const updateStatus = async (orderId: string, status: string, adminMemo: string) => {
    setBusy(orderId);
    const r = await fetch("/api/per/orders", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:orderId, status, adminMemo }) });
    const d = await r.json();
    if (!d.ok) alert(d.error);
    setBusy(null);
    load();
  };

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">제품 신청 관리</span>
          </div>
        </div>
        <div className="pc-header-actions" />
      </header>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"24px 20px 100px" }}>
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {["전체",...Object.keys(ORDER_STATUS_LABEL)].map(s => (
            <button key={s} onClick={() => setStatusF(s)}
              className={`pc-btn pc-btn--sm ${statusF===s ? "pc-btn--primary" : "pc-btn--ghost"}`}>
              {ORDER_STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>

        {loading ? <div style={{ textAlign:"center", padding:40, color:C.hint }}>로딩 중...</div> :
          orders.length === 0
            ? <div style={{ background:C.white, borderRadius:12, padding:40, textAlign:"center", color:C.hint }}>신청 내역이 없습니다.</div>
            : orders.map((o:any) => (
              <div key={o.id} style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:"18px 20px", marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontWeight:800, fontSize:15 }}>{o.clients?.name ?? "—"}</span>
                      <span style={{ fontSize:11, background:`${STATUS_COLOR[o.status]}20`, color:STATUS_COLOR[o.status], borderRadius:4, padding:"2px 8px", fontWeight:700 }}>{ORDER_STATUS_LABEL[o.status]??o.status}</span>
                    </div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{o.reward_products?.name ?? "제품"} × {o.quantity}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:C.orange }}>{o.used_points?.toLocaleString()}P</div>
                    <div style={{ fontSize:11, color:C.hint }}>사용 포인트</div>
                  </div>
                </div>
                {(o.shipping_name || o.shipping_address) && (
                  <div style={{ background:C.light, borderRadius:8, padding:"10px 14px", fontSize:12, color:C.muted, marginBottom:10 }}>
                    📦 {o.shipping_name} · {o.shipping_phone}<br/>{o.shipping_address}
                    {o.request_note && <><br/>요청: {o.request_note}</>}
                  </div>
                )}
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <input value={memo[o.id]??""} onChange={e => setMemo(m => ({ ...m, [o.id]:e.target.value }))} placeholder="처리 메모 입력..."
                    style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:7, padding:"7px 12px", fontSize:12, outline:"none", fontFamily:"inherit" }} />
                  {NEXT_STATUS[o.status] && (
                    <button onClick={() => updateStatus(o.id, NEXT_STATUS[o.status], memo[o.id]??"")} disabled={busy===o.id}
                      className="pc-btn pc-btn--primary pc-btn--sm" style={{ whiteSpace:"nowrap" }}>
                      {busy===o.id?"처리 중...":NEXT_LABEL[o.status]}
                    </button>
                  )}
                  {o.status === "pending" && (
                    <button onClick={() => updateStatus(o.id, "rejected", memo[o.id]??"")} disabled={busy===o.id}
                      className="pc-btn pc-btn--danger pc-btn--sm">반려</button>
                  )}
                </div>
                <div style={{ fontSize:11, color:C.hint, marginTop:8 }}>신청일: {new Date(o.created_at).toLocaleDateString("ko-KR")} {o.admin_memo && `· 메모: ${o.admin_memo}`}</div>
              </div>
            ))
        }
      </div>
    </main>
  );
}
