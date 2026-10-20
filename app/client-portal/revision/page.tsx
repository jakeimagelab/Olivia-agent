"use client";

import { useEffect, useState } from "react";
import { usePortalSession } from "../_hooks/usePortalSession";
import { PortalHeader, PortalNav, PortalCard, PortalError, PortalLoading } from "../_components/PortalShell";
import { C } from "@/lib/theme";
import { CheckCircle2, Mail, PenLine } from "lucide-react";

const G = C.teal, OR = C.orange, MUT = C.muted, BRD = C.border;

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
  const [eligibleApprovals, setEligibleApprovals] = useState<any[]>([]);
  const [completedPhotos, setCompletedPhotos] = useState<any[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ requestType:"general", title:"", content:"", relatedFile:"", priority:"normal" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const load = () => {
    if (!token) return;
    fetch("/api/client-portal/revision", { headers: { "x-portal-token": token } })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) return;
        const approvals = d.eligibleApprovals ?? [];
        setRevisions(d.revisions ?? []);
        setEligibleApprovals(approvals);
        setCompletedPhotos(d.completedPhotos ?? []);
        const requestedId = new URLSearchParams(window.location.search).get("approvalId") ?? "";
        const initialId = approvals.some((item: any) => item.id === requestedId) ? requestedId : approvals[0]?.id ?? "";
        if (initialId) {
          setSelectedApprovalId((current) => current || initialId);
          if (requestedId) setShowForm(true);
        }
      })
      .finally(() => setDataLoading(false));
  };

  useEffect(() => { if (!loading && token) load(); }, [token, loading]);

  const handleSubmit = async () => {
    if (!form.content) return alert("수정 요청 내용을 입력해주세요.");
    const approval = eligibleApprovals.find((item) => item.id === selectedApprovalId);
    const title = form.title || (approval ? `${approval.stepName} 수정 요청` : "일반 수정 요청");
    const payload = approval
      ? {
          ...form,
          title,
          message: form.content,
          approvalId: approval.id,
          projectId: approval.project_id,
          stepKey: approval.stepKey,
        }
      : { ...form, title };
    Object.assign(payload, { photoIds: selectedPhotoIds });
    setSaving(true);
    const r = await fetch("/api/client-portal/revision", {
      method:"POST", headers:{ "Content-Type":"application/json", "x-portal-token": token },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) { setDone(true); setShowForm(false); setSelectedPhotoIds([]); setForm({ requestType:"general", title:"", content:"", relatedFile:"", priority:"normal" }); load(); }
    else alert(d.error ?? "오류가 발생했습니다.");
  };

  if (loading) return <PortalLoading />;
  if (error) return <PortalError message={error} />;
  if (!session) return <PortalError message="세션 정보를 불러올 수 없습니다." />;
  if (dataLoading) return <PortalLoading />;

  return (
    <div>
      <PortalHeader clientName={session.clientName} projectName={session.projectName} managerName={session.managerName} />
      <PortalNav active="수정 요청" visibleMenus={session.visibleMenus} />

      <div style={{ maxWidth:780, margin:"0 auto", padding:"24px 16px 80px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <h1 style={{ display:"flex", alignItems:"center", gap:8, fontSize:20, fontWeight:600, margin:"0 0 4px" }}><PenLine size={20} /> 수정 요청</h1>
            <p style={{ fontSize:13, color:MUT, margin:0 }}>승인된 결과를 선택하고 구체적인 수정 내용을 남겨주세요.</p>
          </div>
          <button onClick={() => setShowForm(v => !v)} style={{ background:OR, color:"#fff", border:"none", borderRadius:10, padding:"9px 16px", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>
            {showForm ? "닫기" : "+ 수정 요청"}
          </button>
        </div>

        {done && (
          <div style={{ background:`${G}10`, border:`1px solid ${G}30`, borderRadius:12, padding:"14px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
            <CheckCircle2 size={20} color={G} />
            <div>
              <div style={{ fontWeight:600, fontSize:13, color:G }}>수정 요청이 접수되었습니다</div>
              <div style={{ fontSize:12, color:MUT, marginTop:2 }}>담당 매니저가 확인 후 처리해드릴 예정입니다.</div>
            </div>
          </div>
        )}

        {showForm && (
          <PortalCard style={{ marginBottom:20, border:`1.5px solid ${G}25` }}>
            <h2 style={{ fontSize:15, fontWeight:600, margin:"0 0 16px", color:G }}>새 수정 요청</h2>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:7 }}>수정할 완료사진 (여러 장 선택 가능)</label>
              {completedPhotos.length ? (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))", gap:8 }}>
                  {completedPhotos.map((photo) => {
                    const selected = selectedPhotoIds.includes(photo.id);
                    return <button key={photo.id} type="button" onClick={() => setSelectedPhotoIds((current) => selected ? current.filter((id) => id !== photo.id) : [...current, photo.id])}
                      aria-pressed={selected}
                      style={{ display:"grid", gap:6, padding:6, minHeight:44, border:`1.5px solid ${selected ? G : BRD}`, borderRadius:8, background:selected?"#EDF5F3":"#fff", color:"#1C2B28", cursor:"pointer", font:"inherit" }}>
                      {photo.thumbnail_url || photo.nas_file_url ? <img src={photo.thumbnail_url || photo.nas_file_url} alt={photo.title || "완료사진"} style={{ width:"100%", aspectRatio:"3/2", objectFit:"cover", borderRadius:5 }} /> : null}
                      <span style={{ fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{photo.title || "완료사진"}</span>
                    </button>;
                  })}
                </div>
              ) : <div style={{ padding:"12px 14px", background:"#F3F7F6", borderRadius:8, fontSize:12, color:MUT }}>완료사진을 고르지 않으면 전체 수정 요청으로 접수됩니다.</div>}
              {completedPhotos.length ? <div style={{ marginTop:6, fontSize:11, color:MUT }}>선택하지 않으면 전체 사진에 대한 요청으로 처리합니다.</div> : null}
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>수정 대상 승인 결과</label>
              <select value={selectedApprovalId} onChange={e => setSelectedApprovalId(e.target.value)} style={iS}>
                {eligibleApprovals.length === 0 && <option value="">일반 요청</option>}
                {eligibleApprovals.map((approval) => (
                  <option key={approval.id} value={approval.id}>{approval.stepName} · {approval.title}</option>
                ))}
              </select>
              <div style={{ fontSize:10, color:C.hint, marginTop:5 }}>
                대표 승인이 완료된 결과만 선택할 수 있습니다.
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>요청 유형</label>
              <select value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType:e.target.value }))} style={iS}>
                {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:MUT, display:"block", marginBottom:5 }}>요청 제목 (선택)</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title:e.target.value }))} placeholder="비워두면 승인 결과 이름으로 자동 생성" style={iS} />
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
                  <button key={v} onClick={() => setForm(f => ({ ...f, priority:v }))} style={{ flex:1, padding:"8px 0", border:`1.5px solid ${form.priority===v?G:BRD}`, borderRadius:8, background:form.priority===v?G:"transparent", color:form.priority===v?"#fff":MUT, fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
                ))}
              </div>
            </div>
            <button onClick={handleSubmit} disabled={saving} style={{ width:"100%", background:OR, color:"#fff", border:"none", borderRadius:10, padding:14, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit", opacity:saving?.6:1 }}>
              {saving ? "전송 중..." : "수정 요청 제출"}
            </button>
          </PortalCard>
        )}

        {revisions.length === 0 && !showForm ? (
          <PortalCard style={{ textAlign:"center", padding:48 }}>
            <PenLine size={40} style={{ marginBottom:12, color:G }} />
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>수정 요청 내역이 없습니다</div>
            <div style={{ fontSize:13, color:MUT, marginBottom:16 }}>사진 보정이나 콘텐츠 수정이 필요하시면 요청을 남겨주세요.</div>
            <button onClick={() => setShowForm(true)} style={{ background:OR, color:"#fff", border:"none", borderRadius:10, padding:"10px 24px", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>수정 요청하기</button>
          </PortalCard>
        ) : (
          revisions.map(r => (
            <PortalCard key={r.id} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:3 }}>{r.title}</div>
                  <div style={{ fontSize:11, color:MUT }}>{REQUEST_TYPES.find(t => t.value===r.request_type)?.label ?? r.request_type}</div>
                </div>
                <span style={{ fontSize:11, color:STATUS_COLOR[r.status], fontWeight:600, background:`${STATUS_COLOR[r.status]}15`, borderRadius:20, padding:"3px 10px", whiteSpace:"nowrap" }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <div style={{ fontSize:13, color:MUT, lineHeight:1.6, marginBottom:r.admin_reply?10:0 }}>{r.content}</div>
              {r.admin_reply && (
                <div style={{ background:`${G}08`, borderLeft:`3px solid ${G}`, borderRadius:"0 8px 8px 0", padding:"10px 12px", marginTop:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, color:G, marginBottom:4 }}><Mail size={13} /> 담당 매니저 답변</div>
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
