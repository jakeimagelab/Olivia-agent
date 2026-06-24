"use client";

import { useEffect, useState } from "react";
import { usePortalSession } from "../_hooks/usePortalSession";
import { PortalHeader, PortalNav, PortalCard, PortalError, PortalLoading } from "../_components/PortalShell";

const G = "#155855", OR = "#E85D2C", MUT = "#5A7470", BRD = "rgba(21,88,85,.10)";
const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${BRD}`, borderRadius:10, padding:"0 12px", height:44, fontSize:13, outline:"none", background:"#fff", color:"#1C2B28", fontFamily:"inherit", boxSizing:"border-box" };

function StarRating({ value, onChange, label }: { value: number; onChange:(v:number)=>void; label:string }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:6 }}>{label}</label>
      <div style={{ display:"flex", gap:4 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            style={{ fontSize:28, background:"none", border:"none", cursor:"pointer", padding:0, opacity:n<=(hover||value)?1:.2, transition:"opacity .1s" }}>
            ⭐
          </button>
        ))}
        <span style={{ fontSize:13, color:MUT, alignSelf:"center", marginLeft:6 }}>{value}점</span>
      </div>
    </div>
  );
}

export default function PortalReviewPage() {
  const { session, loading, error, token } = usePortalSession();
  const [existing, setExisting] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ overallRating:5, shootingRating:5, resultRating:5, goodPoints:"", improvementPoints:"", publicReviewText:"", allowPublicUse:false, allowHospitalName:true, writerName:"" });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token || loading) return;
    fetch("/api/client-portal/review", { headers: { "x-portal-token": token } })
      .then(r => r.json())
      .then(d => { if (d.ok && d.review) setExisting(d.review); })
      .finally(() => setDataLoading(false));
  }, [token, loading]);

  const handleSubmit = async () => {
    if (!form.overallRating) return alert("전체 만족도를 입력해주세요.");
    setSaving(true);
    const r = await fetch("/api/client-portal/review", {
      method:"POST", headers:{ "Content-Type":"application/json", "x-portal-token": token },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) setSubmitted(true);
    else alert(d.error ?? "오류가 발생했습니다.");
  };

  if (loading || dataLoading) return <PortalLoading />;
  if (error) return <PortalError message={error} />;
  if (!session) return <PortalError message="세션 정보를 불러올 수 없습니다." />;

  if (submitted || existing) {
    const r = existing ?? form;
    return (
      <div>
        <PortalHeader clientName={session.clientName} />
        <PortalNav active="리뷰 작성" />
        <div style={{ maxWidth:780, margin:"0 auto", padding:"40px 16px 80px" }}>
          <PortalCard style={{ textAlign:"center", padding:48 }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
            <h2 style={{ fontSize:20, fontWeight:800, margin:"0 0 8px" }}>리뷰 작성 감사합니다!</h2>
            <p style={{ fontSize:14, color:MUT, lineHeight:1.7, margin:"0 0 20px" }}>
              작성해주신 후기는 포토클리닉 서비스 개선과<br />병원 촬영 사례 소개에 소중히 활용됩니다.
            </p>
            {existing && (
              <div style={{ background:`${G}08`, borderRadius:12, padding:"16px 20px", textAlign:"left" }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>⭐ 전체 만족도: {existing.overall_rating}점</div>
                {existing.public_review_text && <div style={{ fontSize:13, color:MUT, lineHeight:1.7 }}>"{existing.public_review_text}"</div>}
              </div>
            )}
          </PortalCard>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PortalHeader clientName={session.clientName} />
      <PortalNav active="리뷰 작성" />

      <div style={{ maxWidth:780, margin:"0 auto", padding:"24px 16px 80px" }}>
        <div style={{ marginBottom:20 }}>
          <h1 style={{ fontSize:20, fontWeight:800, margin:"0 0 4px" }}>⭐ 리뷰 작성</h1>
          <p style={{ fontSize:13, color:MUT, margin:0 }}>촬영 경험을 공유해주세요. 소중한 피드백에 감사드립니다.</p>
        </div>

        <PortalCard>
          <StarRating value={form.overallRating} onChange={v => setForm(f => ({ ...f, overallRating:v }))} label="전체 만족도 *" />
          <StarRating value={form.shootingRating} onChange={v => setForm(f => ({ ...f, shootingRating:v }))} label="촬영 진행 만족도" />
          <StarRating value={form.resultRating} onChange={v => setForm(f => ({ ...f, resultRating:v }))} label="결과물 만족도" />

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>좋았던 점</label>
            <textarea value={form.goodPoints} onChange={e => setForm(f => ({ ...f, goodPoints:e.target.value }))} placeholder="촬영에서 좋았던 점을 자유롭게 작성해주세요." rows={3} style={{ ...iS, height:"auto", padding:"12px" }} />
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>아쉬웠던 점 (선택)</label>
            <textarea value={form.improvementPoints} onChange={e => setForm(f => ({ ...f, improvementPoints:e.target.value }))} placeholder="개선되었으면 하는 점을 알려주세요." rows={3} style={{ ...iS, height:"auto", padding:"12px" }} />
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>공개 가능한 후기 문구 (선택)</label>
            <textarea value={form.publicReviewText} onChange={e => setForm(f => ({ ...f, publicReviewText:e.target.value }))} placeholder="포토클리닉 홈페이지나 SNS에 소개될 수 있는 후기 문구를 작성해주세요." rows={3} style={{ ...iS, height:"auto", padding:"12px" }} />
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>작성자명</label>
            <input value={form.writerName} onChange={e => setForm(f => ({ ...f, writerName:e.target.value }))} placeholder={session.managerName || "담당자명"} style={iS} />
          </div>

          <div style={{ marginBottom:20, display:"flex", flexDirection:"column", gap:10 }}>
            {[
              { key:"allowPublicUse",     label:"후기를 포토클리닉 홈페이지·SNS에 활용하는 것에 동의합니다." },
              { key:"allowHospitalName",  label:"후기에 병원명을 공개하는 것에 동의합니다." },
            ].map(({ key, label }) => (
              <label key={key} style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }}>
                <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]:e.target.checked }))} style={{ width:16, height:16, marginTop:1, flexShrink:0 }} />
                <span style={{ fontSize:13, color:MUT, lineHeight:1.5 }}>{label}</span>
              </label>
            ))}
          </div>

          <div style={{ background:"#F7F4EF", borderRadius:10, padding:"12px 14px", marginBottom:20 }}>
            <div style={{ fontSize:11, color:MUT, lineHeight:1.7 }}>
              작성해주신 후기는 포토클리닉 서비스 개선과 병원 촬영 사례 소개에 소중히 활용됩니다.<br />
              후기 활용 동의 여부는 언제든지 담당 매니저에게 변경 요청하실 수 있습니다.
            </div>
          </div>

          <button onClick={handleSubmit} disabled={saving} style={{ width:"100%", background:G, color:"#fff", border:"none", borderRadius:12, padding:16, fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"inherit", opacity:saving?.6:1 }}>
            {saving ? "제출 중..." : "리뷰 제출하기"}
          </button>
        </PortalCard>
      </div>
    </div>
  );
}
