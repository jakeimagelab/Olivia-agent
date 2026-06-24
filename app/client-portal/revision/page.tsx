"use client";

import { useEffect, useState } from "react";
import { usePortalSession } from "../_hooks/usePortalSession";
import { PortalHeader, PortalNav, PortalCard, PortalError, PortalLoading } from "../_components/PortalShell";

const G = "#155855", OR = "#E85D2C", MUT = "#5A7470", BRD = "rgba(21,88,85,.10)";

const REQUEST_TYPES = [
  { value:"retouching",  label:"사진 보정 수정" },
  { value:"photo_select",label:"사진 추가 선택" },
  { value:"gallery",     label:"갤러리 관련" },
  { value:"website",     label:"홈페이지 시안 수정" },
  { value:"sns",         label:"SNS 콘텐츠 수정" },
  { value:"general",     label:"기타 요청" },
];
const PRIORITY_LABEL: Record<string,string> = { low:"낮음", normal:"보통", high:"높음", urgent:"긴급" };
const STATUS_LABEL:   Record<string,string> = { requested:"접수됨", in_progress:"진행 중", completed:"완료", rejected:"반려" };
const STATUS_COLOR:   Record<string,string> = { requested: MUT, in_progress: OR, completed: G, rejected:"#EF4444" };

const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${BRD}`, borderRadius:10, padding:"0 12px", height:44, fontSize:13, outline:"none", background:"#fff", color:"#1C2B28", fontFamily:"inherit", boxSizing:"border-box" };

export default function PortalRevisionPage() {
  const { session, loading, error, token } = usePortalSession();
  const [revisions, setRevisions] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ requestType:"general", title:"", content:"", relatedFile:"", priority:"normal" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const load = () => {
    if (!token) return;
    fetch("/api/client-portal/revision", { headers: { "x-portal-token": token } })
      .then(r => r.json())
      .then(d => { if (d.ok) setRevisions(d.revisions ?? []); })
      .finally(() => setDataLoading(false));
  };

  useEffect(() => { if (!loading && token) load(); }, [token, loading]);

  const handleSubmit = async () => {
    if (!form.title || !form.content) return alert("제목과 내용을 입력해주세요.");
    setSaving(true);
    const r = await fetch("/api/client-portal/revision", {
      method:"POST", headers:{ "Content-Type":"application/json", "x-portal-token": token },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) { setDone(true); setShowForm(false); setForm({ requestType:"general", title:"", content:"", relatedFile:"", priority:"normal" }); load(); }
    else alert(d.error ?? "오류가 발생했습니다.");
  };

  if (loading || dataLoading) return <PortalLoading />;
  if (error) return <PortalError message={error} />;
  if (!session) return <PortalError message="세션 정보를 불러올 수 없습니다." />;

  return (
    <div>
      <PortalHeader clientName={session.clientName} />
      <PortalNav active="수정 요청" />

      <div style={{ maxWidth:780, margin:"0 auto", padding:"24px 16px 80px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, margin:"0 0 4px" }}>✏️ 수정 요청</h1>
            <p style={{ fontSize:13, color:MUT, margin:0 }}>보정, 콘텐츠, 갤러리 관련 요청을 남겨주세요.</p>
          </div>
          <button onClick={() => setShowForm(v => !v)} style={{ background:G, color:"#fff", border:"none", borderRadius:10, padding:"9px 16px", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>
            {showForm ? "닫기" : "+ 수정 요청"}
          </button>
        </div>

        {done && (
          <div style={{ background:`${G}10`, border:`1px solid ${G}30`, borderRadius:12, padding:"14px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>✅</span>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:G }}>수정 요청이 접수되었습니다</div>
              <div style={{ fontSize:12, color:MUT, marginTop:2 }}>담당 매니저가 확인 후 처리해드릴 예정입니다.</div>
            </div>
          </div>
        )}

        {showForm && (
          <PortalCard style={{ marginBottom:20, border:`1.5px solid ${G}25` }}>
            <h2 style={{ fontSize:15, fontWeight:800, margin:"0 0 16px", color:G }}>새 수정 요청</h2>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>요청 유형</label>
              <select value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType:e.target.value }))} style={iS}>
                {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>요청 제목</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title:e.target.value }))} placeholder="예: 원장님 프로필 배경 밝기 조정" style={iS} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>요청 내용</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content:e.target.value }))} placeholder="구체적인 요청 내용을 입력해주세요." rows={5} style={{ ...iS, height:"auto", padding:"12px" }} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>관련 파일/사진 번호 (선택)</label>
              <input value={form.relatedFile} onChange={e => setForm(f => ({ ...f, relatedFile:e.target.value }))} placeholder="예: IMG_0023, 3번 사진" style={iS} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>우선순위</label>
              <div style={{ display:"flex", gap:6 }}>
                {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, priority:v }))} style={{ flex:1, padding:"8px 0", border:`1.5px solid ${form.priority===v?G:BRD}`, borderRadius:8, background:form.priority===v?G:"transparent", color:form.priority===v?"#fff":MUT, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
                ))}
              </div>
            </div>
            <button onClick={handleSubmit} disabled={saving} style={{ width:"100%", background:G, color:"#fff", border:"none", borderRadius:10, padding:14, fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit", opacity:saving?.6:1 }}>
              {saving ? "전송 중..." : "수정 요청 제출"}
            </button>
          </PortalCard>
        )}

        {revisions.length === 0 && !showForm ? (
          <PortalCard style={{ textAlign:"center", padding:48 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✏️</div>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>수정 요청 내역이 없습니다</div>
            <div style={{ fontSize:13, color:MUT, marginBottom:16 }}>사진 보정이나 콘텐츠 수정이 필요하시면 요청을 남겨주세요.</div>
            <button onClick={() => setShowForm(true)} style={{ background:G, color:"#fff", border:"none", borderRadius:10, padding:"10px 24px", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>수정 요청하기</button>
          </PortalCard>
        ) : (
          revisions.map(r => (
            <PortalCard key={r.id} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, marginBottom:3 }}>{r.title}</div>
                  <div style={{ fontSize:11, color:MUT }}>{REQUEST_TYPES.find(t => t.value===r.request_type)?.label ?? r.request_type}</div>
                </div>
                <span style={{ fontSize:11, color:STATUS_COLOR[r.status], fontWeight:700, background:`${STATUS_COLOR[r.status]}15`, borderRadius:20, padding:"3px 10px", whiteSpace:"nowrap" }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <div style={{ fontSize:13, color:MUT, lineHeight:1.6, marginBottom:r.admin_reply?10:0 }}>{r.content}</div>
              {r.admin_reply && (
                <div style={{ background:`${G}08`, borderLeft:`3px solid ${G}`, borderRadius:"0 8px 8px 0", padding:"10px 12px", marginTop:8 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:G, marginBottom:4 }}>📩 담당 매니저 답변</div>
                  <div style={{ fontSize:13, color:"#1C2B28", lineHeight:1.6 }}>{r.admin_reply}</div>
                </div>
              )}
              <div style={{ fontSize:11, color:"#9BB5B0", marginTop:8 }}>{new Date(r.created_at).toLocaleDateString("ko-KR")} · 우선순위: {PRIORITY_LABEL[r.priority]}</div>
            </PortalCard>
          ))
        )}
      </div>
    </div>
  );
}
