"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePortalSession } from "../_hooks/usePortalSession";
import { PortalHeader, PortalNav, PortalCard, PortalError, PortalLoading } from "../_components/PortalShell";

const G = "#155855", OR = "#E85D2C", MUT = "#5A7470", BRD = "rgba(21,88,85,.10)";

const TX_LABEL: Record<string,string> = { earn:"적립", use:"사용", donate:"기부", adjust:"조정", expire:"만료", cancel:"취소" };
const TX_COLOR: Record<string,string> = { earn:G, use:OR, donate:"#7C3AED", adjust:"#D4A843", expire:MUT, cancel:"#EF4444" };
const TIER_LABEL: Record<string,string> = { standard:"스탠다드", silver:"실버", gold:"골드", vip:"VIP" };
const TIER_COLOR: Record<string,string> = { standard:MUT, silver:"#6B7280", gold:"#D4A843", vip:OR };

export default function PortalPerPage() {
  const { session, loading, error, token } = usePortalSession();
  const [per, setPer] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!token || loading) return;
    fetch("/api/client-portal/per", { headers: { "x-portal-token": token } })
      .then(r => r.json())
      .then(d => { if (d.ok) { setPer(d.per); setTxs(d.transactions ?? []); setSettings(d.settings); } })
      .finally(() => setDataLoading(false));
  }, [token, loading]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} />;
  if (!session) return <PortalError message="세션 정보를 불러올 수 없습니다." />;
  if (dataLoading) return <PortalLoading />;

  if (!per?.per_joined) {
    return (
      <div>
        <PortalHeader clientName={session.clientName} />
        <PortalNav active="PER 포인트" />
        <div style={{ maxWidth:780, margin:"0 auto", padding:"40px 16px 80px" }}>
          <PortalCard style={{ textAlign:"center", padding:48 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🎁</div>
            <h2 style={{ fontSize:18, fontWeight:800, margin:"0 0 8px" }}>PER 리워드 프로그램</h2>
            <p style={{ fontSize:14, color:MUT, lineHeight:1.8, margin:"0 0 20px", maxWidth:380, display:"inline-block" }}>
              포토클리닉 촬영 금액의 1%가 리워드 포인트로 적립됩니다.<br />
              포인트는 선별 제품 신청 또는 기부에 사용할 수 있습니다.
            </p>
            <div style={{ background:`${G}08`, borderRadius:12, padding:"16px 20px", textAlign:"left", maxWidth:340, margin:"0 auto" }}>
              <div style={{ fontSize:12, fontWeight:700, color:G, marginBottom:8 }}>PER · Photoclinic ESG Reward</div>
              <div style={{ fontSize:12, color:MUT, lineHeight:1.7 }}>
                좋은 병원 이미지를 만드는 촬영이,<br />
                좋은 공간과 좋은 나눔으로 이어지도록.
              </div>
            </div>
            <div style={{ marginTop:20, fontSize:12, color:MUT }}>담당 매니저에게 PER 프로그램 등록을 문의해주세요.</div>
          </PortalCard>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PortalHeader clientName={session.clientName} />
      <PortalNav active="PER 포인트" />

      <div style={{ maxWidth:780, margin:"0 auto", padding:"24px 16px 80px" }}>
        {/* 헤더 */}
        <PortalCard style={{ marginBottom:14, background:`linear-gradient(135deg, ${G}, #22876A)`, color:"#fff", border:"none" }}>
          <div style={{ fontSize:11, opacity:.75, fontWeight:700, letterSpacing:.5, marginBottom:4 }}>PER · Photoclinic ESG Reward</div>
          <div style={{ fontSize:13, opacity:.8, marginBottom:12 }}>포토클리닉 이에스지 리워드</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:8 }}>
            <span style={{ fontSize:36, fontWeight:800 }}>{(per.available_points ?? 0).toLocaleString()}</span>
            <span style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>P</span>
          </div>
          <div style={{ fontSize:12, opacity:.7 }}>사용 가능 포인트</div>
          {per.reward_tier && (
            <div style={{ marginTop:12 }}>
              <span style={{ fontSize:11, background:"rgba(255,255,255,.2)", borderRadius:20, padding:"3px 10px", fontWeight:700 }}>
                {TIER_LABEL[per.reward_tier] ?? per.reward_tier} 등급
              </span>
            </div>
          )}
        </PortalCard>

        {/* 포인트 요약 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
          {[
            { label:"누적 적립", value:(per.total_earned_points??0).toLocaleString()+"P", color:G },
            { label:"사용 완료", value:(per.total_used_points??0).toLocaleString()+"P",   color:OR },
            { label:"기부 참여", value:(per.total_donated_points??0).toLocaleString()+"P", color:"#7C3AED" },
          ].map(s => (
            <PortalCard key={s.label} style={{ textAlign:"center", padding:"14px 10px" }}>
              <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:11, color:MUT, marginTop:3 }}>{s.label}</div>
            </PortalCard>
          ))}
        </div>

        {/* 포인트 내역 */}
        <PortalCard style={{ marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:800, color:G, marginBottom:14 }}>포인트 내역</div>
          {txs.length === 0 ? (
            <div style={{ textAlign:"center", padding:"20px 0", color:MUT, fontSize:13 }}>포인트 내역이 없습니다.</div>
          ) : txs.map(t => (
            <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${BRD}` }}>
              <div>
                <span style={{ fontSize:11, background:`${TX_COLOR[t.type]}18`, color:TX_COLOR[t.type], borderRadius:4, padding:"2px 7px", fontWeight:700, marginRight:8 }}>{TX_LABEL[t.type] ?? t.type}</span>
                <span style={{ fontSize:12, color:MUT }}>{t.memo || "—"}</span>
              </div>
              <span style={{ fontWeight:800, fontSize:14, color:t.points>0?G:OR }}>
                {t.points>0?"+":""}{t.points?.toLocaleString()}P
              </span>
            </div>
          ))}
        </PortalCard>

        {/* 정책 안내 */}
        <PortalCard style={{ background:`${G}05` }}>
          <div style={{ fontSize:13, fontWeight:800, color:G, marginBottom:12 }}>포인트 정책 안내</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[
              `촬영 금액의 ${settings ? ((settings.reward_rate??0.01)*100).toFixed(1) : 1}% 적립`,
              "1P = 1원 기준",
              "포인트는 제품 신청 또는 기부에 사용 가능",
              "현금 환급 불가",
              "병원 계정 단위 적립 (개인 지급 아님)",
              settings?.point_expiration_months ? `유효기간 ${settings.point_expiration_months}개월` : "유효기간 24개월",
            ].map(item => (
              <div key={item} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:MUT }}>
                <span style={{ color:G, flexShrink:0 }}>•</span> {item}
              </div>
            ))}
          </div>
        </PortalCard>
      </div>
    </div>
  );
}
