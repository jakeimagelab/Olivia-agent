"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Settings, AlertTriangle } from "lucide-react";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };
const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"0 12px", height:40, fontSize:13, outline:"none", background:C.white, color:C.txt, fontFamily:"inherit", boxSizing:"border-box" };
const taS: React.CSSProperties = { ...iS, height:"auto", padding:"10px 12px", resize:"vertical" };

export default function PerSettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [form,     setForm]     = useState<any>({});
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    fetch("/api/per/settings").then(r => r.json()).then(d => {
      if (d.ok) { setSettings(d.settings); setForm(d.settings); }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/per/settings", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ reward_rate:Number(form.reward_rate), point_value:Number(form.point_value), point_expiration_months:Number(form.point_expiration_months), allow_donation:form.allow_donation, allow_product_order:form.allow_product_order, min_points_to_use:Number(form.min_points_to_use), policy_note:form.policy_note }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return <div style={{ padding:40, textAlign:"center", color:C.hint }}>로딩 중...</div>;

  const previewPoints = Math.floor(2000000 * (Number(form.reward_rate) || 0.01));

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="/assets/photoclinic-logo.png" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">포인트 정책 설정</span>
          </div>
        </div>
        <div className="pc-header-actions" />
      </header>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"24px 20px 100px" }}>
        <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:28, marginBottom:20 }}>
          <h2 style={{ margin:"0 0 20px", fontSize:15, fontWeight:800, display:"flex", alignItems:"center", gap:8 }}>
            <Settings size={16} color={C.teal}/> 적립 정책
          </h2>

          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>포인트 적립률</label>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="number" step="0.001" min="0" max="1" value={form.reward_rate ?? 0.01}
                onChange={e => setForm((p:any) => ({ ...p, reward_rate:e.target.value }))} style={{ ...iS, flex:1 }} />
              <span style={{ fontSize:14, fontWeight:700, color:C.teal }}>{((Number(form.reward_rate)||0.01)*100).toFixed(1)}%</span>
            </div>
            <div style={{ fontSize:11, color:C.green, marginTop:4 }}>200만원 결제 시 → {previewPoints.toLocaleString()}P 적립</div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>포인트 단위 (1P = N원)</label>
              <input type="number" value={form.point_value ?? 1} onChange={e => setForm((p:any) => ({ ...p, point_value:e.target.value }))} style={iS} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>포인트 유효기간 (개월)</label>
              <input type="number" value={form.point_expiration_months ?? 24} onChange={e => setForm((p:any) => ({ ...p, point_expiration_months:e.target.value }))} style={iS} />
            </div>
          </div>

          <div>
            <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>최소 사용 포인트</label>
            <input type="number" value={form.min_points_to_use ?? 1000} onChange={e => setForm((p:any) => ({ ...p, min_points_to_use:e.target.value }))} style={iS} />
          </div>
        </div>

        <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:28, marginBottom:20 }}>
          <h2 style={{ margin:"0 0 16px", fontSize:15, fontWeight:800 }}>기능 설정</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {[
              { key:"allow_product_order", label:"제품 신청 기능 활성화", desc:"병원이 포인트로 제품을 신청할 수 있습니다." },
              { key:"allow_donation",      label:"기부 기능 활성화",      desc:"병원이 포인트를 기부 캠페인에 사용할 수 있습니다." },
            ].map(f => (
              <label key={f.key} style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }}>
                <input type="checkbox" checked={form[f.key] ?? true} onChange={e => setForm((p:any) => ({ ...p, [f.key]:e.target.checked }))} style={{ marginTop:2 }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{f.label}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{f.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:28, marginBottom:20 }}>
          <h2 style={{ margin:"0 0 12px", fontSize:15, fontWeight:800 }}>운영 정책 메모</h2>
          <textarea value={form.policy_note ?? ""} onChange={e => setForm((p:any) => ({ ...p, policy_note:e.target.value }))} rows={4} placeholder="내부 운영 메모나 추가 정책 설명을 입력하세요." style={taS} />
        </div>

        {/* 법무 주의 */}
        <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
            <AlertTriangle size={16} color="#D97706" style={{ flexShrink:0, marginTop:1 }}/>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:"#92400E", marginBottom:6 }}>⚠️ 운영 전 세무/법무 검토 필요</div>
              <ul style={{ margin:0, padding:"0 0 0 16px", fontSize:12, color:"#78350F", lineHeight:1.8 }}>
                <li>포인트는 병원 계정 단위로 적립됩니다. 현금 환급 불가.</li>
                <li>포인트는 제품 신청 또는 기부에만 사용할 수 있습니다.</li>
                <li>병원 개인(원장/직원) 단위가 아닌 병원 운영/브랜딩 목적의 리워드입니다.</li>
                <li>고급 와인 등 주류는 관리자 승인 후 별도 안내가 필요합니다.</li>
                <li>기부 내역은 투명하게 기록되며, 병원명 공개 여부를 선택할 수 있습니다.</li>
                <li>실제 운영 전 세무사/법무사 검토를 권장합니다.</li>
              </ul>
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="pc-btn pc-btn--primary" style={{ width: "100%", background: saved ? C.green : undefined }}>
          {saved ? "✓ 저장 완료" : saving ? "저장 중..." : "정책 저장"}
        </button>
      </div>
    </main>
  );
}
