"use client";
import Link from "next/link";

const G = "#155855", OR = "#E85D2C", MUT = "#5A7470", BRD = "rgba(21,88,85,.10)";

export function PortalHeader({ clientName }: { clientName?: string }) {
  return (
    <header style={{ background:"#fff", borderBottom:`1px solid ${BRD}`, padding:"0 20px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 8px rgba(21,88,85,.06)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <img src="/assets/photoclinic-logo.png" alt="포토클리닉" style={{ height:22 }} />
        <span style={{ fontSize:11, color:MUT, fontWeight:600 }}>고객 전용 포털</span>
      </div>
      {clientName && (
        <div style={{ fontSize:12, fontWeight:700, color:G, background:`${G}10`, borderRadius:20, padding:"4px 12px" }}>
          {clientName}
        </div>
      )}
    </header>
  );
}

export function PortalNav({ active }: { active: string }) {
  const items = [
    { href:"/client-portal/dashboard", label:"홈" },
    { href:"/client-portal/gallery",   label:"갤러리" },
    { href:"/client-portal/revision",  label:"수정 요청" },
    { href:"/client-portal/review",    label:"리뷰 작성" },
    { href:"/client-portal/per",       label:"PER 포인트" },
  ];
  return (
    <nav style={{ background:"#fff", borderBottom:`1px solid ${BRD}`, padding:"0 20px", display:"flex", gap:2, overflowX:"auto" }}>
      {items.map(it => (
        <Link key={it.href} href={it.href} style={{ display:"inline-block", padding:"12px 14px", fontSize:13, fontWeight:700, color:active===it.label?G:MUT, borderBottom:active===it.label?`2px solid ${G}`:"2px solid transparent", textDecoration:"none", whiteSpace:"nowrap", transition:"color .15s" }}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function PortalCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background:"#fff", borderRadius:16, border:`1px solid ${BRD}`, padding:24, boxShadow:"0 2px 8px rgba(21,88,85,.04)", ...style }}>
      {children}
    </div>
  );
}

export function PortalError({ message }: { message: string }) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, textAlign:"center" }}>
      <img src="/assets/photoclinic-logo.png" alt="포토클리닉" style={{ height:32, marginBottom:20, opacity:.4 }} />
      <div style={{ fontSize:36, marginBottom:12 }}>🔐</div>
      <h2 style={{ fontSize:18, fontWeight:800, color:"#1C2B28", margin:"0 0 8px" }}>접근할 수 없습니다</h2>
      <p style={{ fontSize:14, color:MUT, lineHeight:1.7, margin:"0 0 24px", maxWidth:320 }}>{message}</p>
      <p style={{ fontSize:12, color:"#9BB5B0" }}>포토클리닉으로부터 받은 링크로 접속해주세요.</p>
    </div>
  );
}

export function PortalLoading() {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <img src="/assets/photoclinic-logo.png" alt="포토클리닉" style={{ height:28, opacity:.3, marginBottom:16 }} />
        <div style={{ fontSize:13, color:"#9BB5B0" }}>로딩 중...</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const good = ["갤러리전달","최종완료","리뷰작성"].includes(status);
  const prog = ["촬영완료","원본전달","보정진행"].includes(status);
  const bg   = good ? `${G}15` : prog ? "#FFF3E8" : `${G}08`;
  const color = good ? G : prog ? OR : MUT;
  return <span style={{ fontSize:11, background:bg, color, borderRadius:20, padding:"3px 10px", fontWeight:700 }}>{status}</span>;
}
