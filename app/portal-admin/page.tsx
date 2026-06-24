"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, RefreshCw, ExternalLink, X, Users, Star, Edit2 } from "lucide-react";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };
const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"0 12px", height:40, fontSize:13, outline:"none", background:C.white, color:C.txt, fontFamily:"inherit", boxSizing:"border-box" };

type Client = { id:string; name:string; manager_name:string; email:string; workflow_status:string };
type Access  = { id:string; access_token:string; email:string; token_expires_at:string|null; is_active:boolean; last_login_at:string|null; created_at:string };

const STATUS_COLOR: Record<string,string> = { 상담완료:C.muted, 갤러리전달:C.green, 최종완료:C.green };

export default function PortalAdminPage() {
  const [clients,  setClients]  = useState<Client[]>([]);
  const [tab,      setTab]      = useState<"links"|"revisions"|"reviews">("links");
  const [loading,  setLoading]  = useState(true);
  const [q,        setQ]        = useState("");
  const [accesses, setAccesses] = useState<Record<string, Access|null>>({});
  const [creating, setCreating] = useState<string|null>(null);
  const [expDays,  setExpDays]  = useState(90);
  const [modal,    setModal]    = useState<Client|null>(null);
  const [copied,   setCopied]   = useState("");
  const [revisions, setRevisions] = useState<any[]>([]);
  const [reviews,   setReviews]   = useState<any[]>([]);
  const [replyId,   setReplyId]   = useState<string|null>(null);
  const [replyText, setReplyText] = useState("");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    setLoading(true);
    fetch("/api/clients").then(r => r.json()).then(d => setClients(d.clients ?? [])).finally(() => setLoading(false));
    if (tab === "revisions") {
      fetch("/api/admin/client-portal/revisions").then(r => r.json()).then(d => setRevisions(d.revisions ?? []));
    }
    if (tab === "reviews") {
      fetch("/api/admin/client-portal/reviews").then(r => r.json()).then(d => setReviews(d.reviews ?? []));
    }
  }, [tab]);

  const loadAccess = async (clientId: string) => {
    const r = await fetch(`/api/admin/client-portal/access?clientId=${clientId}`);
    const d = await r.json();
    setAccesses(prev => ({ ...prev, [clientId]: d.activeAccess ?? null }));
  };

  const createLink = async (client: Client) => {
    setCreating(client.id);
    const r = await fetch("/api/admin/client-portal/access", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ clientId:client.id, email:client.email, expiresInDays:expDays }),
    });
    const d = await r.json();
    if (d.ok) {
      await loadAccess(client.id);
      setModal(null);
    }
    setCreating(null);
  };

  const revokeLink = async (clientId: string) => {
    if (!confirm("포털 접근을 비활성화하시겠습니까?")) return;
    await fetch("/api/admin/client-portal/access", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ clientId }) });
    setAccesses(prev => ({ ...prev, [clientId]: null }));
  };

  const copyLink = (token: string) => {
    const url = `${baseUrl}/client-portal/access/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(""), 2000);
  };

  const filtered = clients.filter(c => !q || c.name.includes(q) || (c.manager_name ?? "").includes(q));

  const updateRevisionStatus = async (id: string, status: string, reply?: string) => {
    await fetch("/api/admin/client-portal/revisions", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id, status, adminReply:reply }) });
    setRevisions(prev => prev.map(r => r.id===id ? { ...r, status, admin_reply:reply??r.admin_reply } : r));
    setReplyId(null);
  };

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href="/" className="pc-header-back">← 관리자 홈</Link>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">고객 포털 관리</span>
          </div>
        </div>
        <div className="pc-header-actions">
          <a href="/client-portal/dashboard" target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:5, height:36, padding:"0 12px", borderRadius:9, background:C.light, color:C.teal, fontWeight:700, fontSize:12, textDecoration:"none" }}>
            <ExternalLink size={12}/> 고객 포털 미리보기
          </a>
        </div>
      </header>

      {/* 탭 */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"0 24px", display:"flex", gap:4 }}>
        {[
          { key:"links",     icon:<Users size={13}/>,  label:"포털 링크 관리" },
          { key:"revisions", icon:<Edit2 size={13}/>,  label:"수정 요청" },
          { key:"reviews",   icon:<Star size={13}/>,   label:"고객 리뷰" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{ display:"flex", alignItems:"center", gap:6, padding:"12px 14px", background:"none", border:"none", borderBottom:tab===t.key?`2px solid ${C.teal}`:"2px solid transparent", color:tab===t.key?C.teal:C.muted, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:1000, margin:"0 auto", padding:"24px 20px 80px" }}>

        {/* ─── 링크 관리 탭 ─── */}
        {tab === "links" && (
          <>
            <div style={{ display:"flex", gap:10, marginBottom:16 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="병원명 검색..." style={{ ...iS, maxWidth:300 }} />
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:C.muted }}>
                유효기간:
                <select value={expDays} onChange={e => setExpDays(Number(e.target.value))} style={{ ...iS, width:100 }}>
                  <option value={30}>30일</option>
                  <option value={60}>60일</option>
                  <option value={90}>90일</option>
                  <option value={180}>180일</option>
                  <option value={365}>365일</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign:"center", padding:40, color:C.hint }}>로딩 중...</div>
            ) : filtered.map(client => {
              const acc = accesses[client.id];
              const loaded = client.id in accesses;
              return (
                <div key={client.id} style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:"16px 20px", marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <span style={{ fontWeight:800, fontSize:14 }}>{client.name}</span>
                        <span style={{ fontSize:10, color:STATUS_COLOR[client.workflow_status]??C.muted, background:`${STATUS_COLOR[client.workflow_status]??C.muted}15`, borderRadius:4, padding:"2px 7px", fontWeight:700 }}>{client.workflow_status}</span>
                        {acc && <span style={{ fontSize:10, background:`${C.green}15`, color:C.green, borderRadius:4, padding:"2px 7px", fontWeight:700 }}>포털 활성</span>}
                      </div>
                      <div style={{ fontSize:12, color:C.muted }}>{client.manager_name || "—"} {client.email ? `· ${client.email}` : ""}</div>
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      {!loaded && (
                        <button onClick={() => loadAccess(client.id)} style={{ height:32, padding:"0 10px", border:`1px solid ${C.border}`, borderRadius:7, background:"transparent", color:C.muted, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          현황 보기
                        </button>
                      )}
                      {loaded && !acc && (
                        <button onClick={() => setModal(client)} style={{ height:32, padding:"0 12px", border:"none", borderRadius:7, background:C.teal, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          + 링크 생성
                        </button>
                      )}
                      {acc && (
                        <>
                          <button onClick={() => copyLink(acc.access_token)} style={{ height:32, padding:"0 10px", border:`1px solid ${C.border}`, borderRadius:7, background: copied===acc.access_token?C.green:C.light, color: copied===acc.access_token?"#fff":C.teal, fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                            <Copy size={11}/> {copied===acc.access_token ? "복사됨!" : "링크 복사"}
                          </button>
                          <button onClick={() => setModal(client)} style={{ height:32, padding:"0 10px", border:`1px solid ${C.border}`, borderRadius:7, background:C.light, color:C.teal, fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                            <RefreshCw size={11}/> 재발급
                          </button>
                          <button onClick={() => revokeLink(client.id)} style={{ height:32, padding:"0 10px", border:`1px solid #FCA5A5`, borderRadius:7, background:"#FEF2F2", color:"#EF4444", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                            <X size={11}/> 비활성화
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {acc && (
                    <div style={{ marginTop:10, padding:"8px 12px", background:C.light, borderRadius:8, fontSize:11, color:C.muted, display:"flex", gap:16, flexWrap:"wrap" }}>
                      <span>🔗 {baseUrl}/client-portal/access/{acc.access_token.slice(0,16)}...</span>
                      {acc.token_expires_at && <span>만료: {new Date(acc.token_expires_at).toLocaleDateString("ko-KR")}</span>}
                      {acc.last_login_at ? <span>최근 접속: {new Date(acc.last_login_at).toLocaleDateString("ko-KR")}</span> : <span>미접속</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ─── 수정 요청 탭 ─── */}
        {tab === "revisions" && (
          <>
            <div style={{ fontWeight:700, fontSize:13, color:C.muted, marginBottom:12 }}>수정 요청 ({revisions.length}건)</div>
            {revisions.length === 0 ? (
              <div style={{ background:C.white, borderRadius:12, padding:40, textAlign:"center", color:C.hint }}>수정 요청이 없습니다.</div>
            ) : revisions.map(r => (
              <div key={r.id} style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:"16px 20px", marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14, marginBottom:2 }}>{r.title}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{r.clients?.name} · {r.request_type} · 우선순위: {r.priority}</div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {r.status === "requested" && <button onClick={() => updateRevisionStatus(r.id,"in_progress")} style={{ padding:"5px 10px", border:"none", borderRadius:6, background:`${C.orange}15`, color:C.orange, fontWeight:700, fontSize:11, cursor:"pointer" }}>진행 시작</button>}
                    {r.status === "in_progress" && <button onClick={() => updateRevisionStatus(r.id,"completed")} style={{ padding:"5px 10px", border:"none", borderRadius:6, background:`${C.green}15`, color:C.green, fontWeight:700, fontSize:11, cursor:"pointer" }}>완료 처리</button>}
                    <button onClick={() => { setReplyId(r.id); setReplyText(r.admin_reply ?? ""); }} style={{ padding:"5px 10px", border:`1px solid ${C.border}`, borderRadius:6, background:C.light, color:C.muted, fontWeight:700, fontSize:11, cursor:"pointer" }}>답변 작성</button>
                  </div>
                </div>
                <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>{r.content}</div>
                {r.admin_reply && (
                  <div style={{ marginTop:8, padding:"8px 12px", background:`${C.teal}08`, borderLeft:`3px solid ${C.teal}`, borderRadius:"0 8px 8px 0", fontSize:12, color:C.txt }}>
                    📩 {r.admin_reply}
                  </div>
                )}
                {replyId === r.id && (
                  <div style={{ marginTop:10, display:"flex", gap:8 }}>
                    <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="고객에게 보낼 답변..." style={{ ...iS, flex:1 }} />
                    <button onClick={() => updateRevisionStatus(r.id, r.status, replyText)} style={{ padding:"0 14px", border:"none", borderRadius:8, background:C.teal, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>저장</button>
                  </div>
                )}
                <div style={{ fontSize:11, color:C.hint, marginTop:6 }}>{new Date(r.created_at).toLocaleDateString("ko-KR")} · 상태: {r.status}</div>
              </div>
            ))}
          </>
        )}

        {/* ─── 리뷰 탭 ─── */}
        {tab === "reviews" && (
          <>
            <div style={{ fontWeight:700, fontSize:13, color:C.muted, marginBottom:12 }}>고객 리뷰 ({reviews.length}건)</div>
            {reviews.length === 0 ? (
              <div style={{ background:C.white, borderRadius:12, padding:40, textAlign:"center", color:C.hint }}>작성된 리뷰가 없습니다.</div>
            ) : reviews.map(r => (
              <div key={r.id} style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:"18px 20px", marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14 }}>{r.clients?.name}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{r.writer_name} · {new Date(r.created_at).toLocaleDateString("ko-KR")}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:20 }}>{"⭐".repeat(r.overall_rating)}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{r.overall_rating}점</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:16, marginBottom:10 }}>
                  <div style={{ fontSize:12, color:C.muted }}>촬영 진행: {r.shooting_rating}점</div>
                  <div style={{ fontSize:12, color:C.muted }}>결과물: {r.result_rating}점</div>
                </div>
                {r.good_points && <div style={{ fontSize:13, marginBottom:6 }}><span style={{ fontWeight:700, color:C.green }}>👍 </span>{r.good_points}</div>}
                {r.improvement_points && <div style={{ fontSize:13, marginBottom:6 }}><span style={{ fontWeight:700, color:C.orange }}>💬 </span>{r.improvement_points}</div>}
                {r.public_review_text && (
                  <div style={{ marginTop:10, padding:"10px 14px", background:`${C.teal}08`, borderRadius:8, fontSize:13, color:C.txt, fontStyle:"italic" }}>
                    "{r.public_review_text}"
                  </div>
                )}
                <div style={{ marginTop:8, display:"flex", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontSize:10, background:r.allow_public_use?`${C.green}15`:`${C.hint}15`, color:r.allow_public_use?C.green:C.hint, borderRadius:4, padding:"2px 7px", fontWeight:700 }}>{r.allow_public_use?"SNS 활용 동의":"비공개"}</span>
                  <span style={{ fontSize:10, background:r.allow_hospital_name?`${C.teal}15`:`${C.hint}15`, color:r.allow_hospital_name?C.teal:C.hint, borderRadius:4, padding:"2px 7px", fontWeight:700 }}>{r.allow_hospital_name?"병원명 공개":"익명"}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 링크 생성 모달 */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setModal(null)}>
          <div style={{ background:C.white, borderRadius:16, padding:28, width:380, maxWidth:"90vw" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin:"0 0 6px", fontSize:16, fontWeight:800 }}>고객 포털 링크 생성</h2>
            <div style={{ fontSize:13, color:C.muted, marginBottom:20 }}>{modal.name}</div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>유효기간</label>
              <select value={expDays} onChange={e => setExpDays(Number(e.target.value))} style={iS}>
                <option value={30}>30일</option><option value={60}>60일</option><option value={90}>90일 (권장)</option>
                <option value={180}>180일</option><option value={365}>1년</option>
              </select>
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:20, lineHeight:1.7, background:C.light, borderRadius:8, padding:"10px 12px" }}>
              링크 생성 시 기존 링크는 자동으로 비활성화됩니다.<br />
              고객에게 새 링크를 복사하여 직접 전달해주세요.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setModal(null)} style={{ flex:1, background:C.light, color:C.muted, border:"none", borderRadius:8, padding:12, fontWeight:700, cursor:"pointer" }}>취소</button>
              <button onClick={() => createLink(modal)} disabled={creating===modal.id} style={{ flex:2, background:C.teal, color:"#fff", border:"none", borderRadius:8, padding:12, fontWeight:700, cursor:"pointer", opacity:creating===modal.id?.6:1 }}>
                {creating===modal.id ? "생성 중..." : "링크 생성"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
