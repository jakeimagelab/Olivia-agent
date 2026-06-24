"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePortalSession } from "../_hooks/usePortalSession";
import { PortalHeader, PortalNav, PortalCard, PortalError, PortalLoading } from "../_components/PortalShell";

const G = "#155855", OR = "#E85D2C", MUT = "#5A7470", BRD = "rgba(21,88,85,.10)";

export default function PortalGalleryPage() {
  const { session, loading, error, token } = usePortalSession();
  const [galleries, setGalleries] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!token || loading) return;
    fetch("/api/client-portal/gallery", { headers: { "x-portal-token": token } })
      .then(r => r.json())
      .then(d => { if (d.ok) setGalleries(d.galleries ?? []); })
      .finally(() => setDataLoading(false));
  }, [token, loading]);

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} />;
  if (!session) return <PortalError message="세션 정보를 불러올 수 없습니다." />;
  if (dataLoading) return <PortalLoading />;

  return (
    <div>
      <PortalHeader clientName={session.clientName} />
      <PortalNav active="갤러리" />

      <div style={{ maxWidth:780, margin:"0 auto", padding:"24px 16px 80px" }}>
        <div style={{ marginBottom:20 }}>
          <h1 style={{ fontSize:20, fontWeight:800, margin:"0 0 4px" }}>📸 갤러리</h1>
          <p style={{ fontSize:13, color:MUT, margin:0 }}>촬영 결과물과 다운로드 링크를 확인하세요.</p>
        </div>

        {galleries.length === 0 ? (
          <PortalCard style={{ textAlign:"center", padding:48 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📷</div>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>아직 전달된 갤러리가 없습니다</div>
            <div style={{ fontSize:13, color:MUT }}>촬영 완료 후 담당 매니저가 갤러리 링크를 전달드릴 예정입니다.</div>
          </PortalCard>
        ) : (
          galleries.map(g => (
            <PortalCard key={g.id} style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>{g.title || "촬영 갤러리"}</div>
                  {g.shoot_date && <div style={{ fontSize:12, color:MUT }}>촬영일: {new Date(g.shoot_date).toLocaleDateString("ko-KR")}</div>}
                </div>
                <span style={{ fontSize:10, background:`${G}15`, color:G, borderRadius:4, padding:"2px 8px", fontWeight:700 }}>{g.status ?? "전달완료"}</span>
              </div>

              {g.description && (
                <div style={{ fontSize:13, color:MUT, marginBottom:14, lineHeight:1.6, background:`${G}05`, borderRadius:8, padding:"10px 12px" }}>
                  {g.description}
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {g.gallery_link && (
                  <LinkRow icon="🖼️" label="보정 갤러리 (선택본)" href={g.gallery_link} primary />
                )}
                {g.retouched_link && (
                  <LinkRow icon="✨" label="보정본 전체 보기" href={g.retouched_link} />
                )}
                {g.original_link && (
                  <LinkRow icon="📦" label="원본 파일 보기" href={g.original_link} />
                )}
                {g.nas_link && (
                  <LinkRow icon="💾" label="NAS 다운로드 링크" href={g.nas_link} />
                )}
              </div>

              <div style={{ marginTop:14, padding:"10px 14px", background:"#FFF8F5", borderRadius:10, borderLeft:`3px solid ${OR}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:OR, marginBottom:4 }}>📌 사진 이용 안내</div>
                <div style={{ fontSize:11, color:MUT, lineHeight:1.7 }}>
                  촬영 결과물은 계약서에 명시된 범위 내에서 사용 가능합니다.<br />
                  상업적 2차 활용 시 담당 매니저에게 사전 확인해주세요.
                </div>
              </div>

              <div style={{ marginTop:12, display:"flex", gap:8 }}>
                <Link href="/client-portal/revision" style={{ flex:1, textAlign:"center", fontSize:12, fontWeight:700, color:G, background:`${G}10`, borderRadius:8, padding:"8px 0", textDecoration:"none" }}>
                  ✏️ 수정 요청하기
                </Link>
                <Link href="/client-portal/review" style={{ flex:1, textAlign:"center", fontSize:12, fontWeight:700, color:"#fff", background:OR, borderRadius:8, padding:"8px 0", textDecoration:"none" }}>
                  ⭐ 리뷰 작성하기
                </Link>
              </div>
            </PortalCard>
          ))
        )}
      </div>
    </div>
  );
}

function LinkRow({ icon, label, href, primary }: { icon: string; label: string; href: string; primary?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", background: primary ? "#155855" : "#F7F4EF", borderRadius:10, textDecoration:"none", color: primary ? "#fff" : "#1C2B28" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <span style={{ fontSize:13, fontWeight:700 }}>{label}</span>
      </div>
      <span style={{ fontSize:12, opacity:.7 }}>열기 →</span>
    </a>
  );
}
