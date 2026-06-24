"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Gift, TrendingUp, Users, Heart, ShoppingBag, BarChart2, Settings, Award, ArrowRight, Leaf } from "lucide-react";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };

const NAV = [
  { href:"/per/clients",   icon:Users,       label:"병원별 포인트",    desc:"병원별 포인트 조회 및 관리" },
  { href:"/per/products",  icon:ShoppingBag, label:"리워드 카탈로그",  desc:"제품 등록 및 카탈로그 운영" },
  { href:"/per/orders",    icon:Gift,        label:"제품 신청 관리",   desc:"신청 접수·승인·배송 처리" },
  { href:"/per/campaigns", icon:Heart,       label:"기부 캠페인",      desc:"반기별 공동 기부 캠페인 운영" },
  { href:"/per/donations", icon:Leaf,        label:"기부 내역",        desc:"병원별 기부 참여 기록" },
  { href:"/per/reports",   icon:BarChart2,   label:"PER 리포트",       desc:"병원별·캠페인별 리포트 생성" },
  { href:"/per/settings",  icon:Settings,    label:"포인트 정책 설정", desc:"적립률·유효기간·정책 관리" },
];

function StatCard({ label, value, sub, color = C.teal }: { label:string; value:string; sub?:string; color?:string }) {
  return (
    <div style={{ background:C.white, borderRadius:12, padding:"18px 20px", border:`1px solid ${C.border}`, boxShadow:"0 2px 8px rgba(21,88,85,.05)" }}>
      <div style={{ fontSize:11, color:C.hint, fontWeight:600, letterSpacing:".5px", textTransform:"uppercase", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

const TX_TYPE_LABEL: Record<string,string> = { earn:"적립", use:"사용", donate:"기부", adjust:"조정", expire:"만료", cancel:"취소" };
const TX_TYPE_COLOR: Record<string,string> = { earn:C.green, use:C.orange, donate:"#7C3AED", adjust:"#D4A843", expire:C.hint, cancel:"#EF4444" };

export default function PerDashboard() {
  const [summary, setSummary]   = useState<any>(null);
  const [recent,  setRecent]    = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/per/summary")
      .then(r => r.json())
      .then(d => { if (d.ok) { setSummary(d.summary); setRecent(d.recentTransactions ?? []); } })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ minHeight:"100vh", background:C.bg, padding:"0 0 60px" }}>
      {/* 헤더 */}
      <div style={{ background:`linear-gradient(135deg, ${C.teal}, ${C.green})`, color:"#fff", padding:"32px 24px 28px" }}>
        <div style={{ maxWidth:900, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <Award size={22} />
            <span style={{ fontSize:13, fontWeight:700, letterSpacing:1, opacity:.85 }}>PER · Photoclinic ESG Reward</span>
          </div>
          <h1 style={{ margin:0, fontSize:26, fontWeight:800 }}>포토클리닉 이에스지 리워드</h1>
          <p style={{ margin:"8px 0 0", fontSize:13, opacity:.8 }}>좋은 병원 이미지를 만드는 촬영이, 좋은 공간과 좋은 나눔으로 이어지도록.</p>
          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <Link href="/per/clients" style={{ background:"rgba(255,255,255,.15)", color:"#fff", border:"1px solid rgba(255,255,255,.3)", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700, textDecoration:"none" }}>
              포인트 적립 +
            </Link>
            <Link href="/per/products" style={{ background:"rgba(255,255,255,.1)", color:"#fff", border:"1px solid rgba(255,255,255,.2)", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700, textDecoration:"none" }}>
              카탈로그 보기
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 16px 0" }}>
        {/* 요약 카드 */}
        {loading ? (
          <div style={{ textAlign:"center", padding:40, color:C.hint }}>로딩 중...</div>
        ) : summary ? (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
              <StatCard label="총 누적 촬영 금액" value={`${(summary.totalPaid/10000).toFixed(0)}만원`} color={C.teal} />
              <StatCard label="총 적립 포인트"   value={`${summary.totalEarned?.toLocaleString()}P`} color={C.green} />
              <StatCard label="사용 가능 포인트" value={`${summary.totalAvailable?.toLocaleString()}P`} color={C.orange} />
              <StatCard label="총 기부 포인트"   value={`${summary.totalDonated?.toLocaleString()}P`} color="#7C3AED" />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:28 }}>
              <StatCard label="PER 참여 병원"    value={`${summary.perClients}곳`} />
              <StatCard label="VIP 병원"         value={`${summary.vipCount}곳`} color={C.orange} />
              <StatCard label="제품 신청 대기"   value={`${summary.pendingOrders}건`} color={summary.pendingOrders > 0 ? C.orange : C.hint} />
              <StatCard label="진행 중 기부 캠페인" value={`${summary.activeCampaigns}개`} color="#7C3AED" />
            </div>
          </>
        ) : null}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          {/* 최근 포인트 내역 */}
          <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden" }}>
            <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700, fontSize:14 }}>최근 포인트 내역</span>
              <Link href="/per/clients" style={{ fontSize:11, color:C.teal, fontWeight:700, textDecoration:"none" }}>전체 →</Link>
            </div>
            {recent.length === 0 ? (
              <div style={{ padding:24, textAlign:"center", color:C.hint, fontSize:13 }}>내역이 없습니다</div>
            ) : recent.map((tx: any) => (
              <div key={tx.id} style={{ padding:"12px 20px", borderBottom:`1px solid ${C.light}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <span style={{ fontSize:11, background:`${TX_TYPE_COLOR[tx.type]}22`, color:TX_TYPE_COLOR[tx.type], borderRadius:4, padding:"2px 7px", fontWeight:700 }}>
                    {TX_TYPE_LABEL[tx.type] ?? tx.type}
                  </span>
                  <span style={{ fontSize:12, color:C.muted, marginLeft:8 }}>{tx.memo || "—"}</span>
                </div>
                <span style={{ fontWeight:800, fontSize:13, color: tx.points > 0 ? C.green : C.orange }}>
                  {tx.points > 0 ? "+" : ""}{tx.points?.toLocaleString()}P
                </span>
              </div>
            ))}
          </div>

          {/* 메뉴 바로가기 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, alignContent:"start" }}>
            {NAV.map(n => (
              <Link key={n.href} href={n.href} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"16px", textDecoration:"none", display:"block", transition:"box-shadow .15s" }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(21,88,85,.12)")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
                <n.icon size={18} color={C.teal} />
                <div style={{ marginTop:8, fontWeight:700, fontSize:13, color:C.txt }}>{n.label}</div>
                <div style={{ fontSize:11, color:C.hint, marginTop:2 }}>{n.desc}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* ESG 설명 */}
        <div style={{ marginTop:24, background:`linear-gradient(135deg,${C.teal}08,${C.green}10)`, border:`1px solid ${C.teal}20`, borderRadius:14, padding:"20px 24px" }}>
          <div style={{ fontWeight:800, fontSize:14, color:C.teal, marginBottom:6 }}>PER란?</div>
          <p style={{ margin:0, fontSize:13, color:C.muted, lineHeight:1.7 }}>
            PER(Photoclinic ESG Reward)는 포토클리닉 촬영 금액의 1%를 리워드 포인트로 적립해, 병원 브랜딩에 어울리는 선별 제품 신청 또는 사회공헌 기부로 연결하는 ESG 리워드 프로그램입니다.
            포인트는 병원 계정 단위로 적립되며, 현금 환급은 불가합니다.
          </p>
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            {["촬영 금액의 1% 적립","제품 신청 또는 기부","반기별 공동 기부 리포트"].map(t => (
              <span key={t} style={{ fontSize:11, background:`${C.teal}15`, color:C.teal, borderRadius:20, padding:"3px 10px", fontWeight:600 }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
