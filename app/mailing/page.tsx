"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import { useContactDirectory } from "@/lib/hooks/useContactDirectory";
import { C } from "@/lib/theme";
import { PageHeading } from "@/components/PageHeading";

const iS: React.CSSProperties = {
  width: "100%", border: `1px solid ${C.border}`, borderRadius: 9,
  padding: "10px 13px", fontSize: 13, fontFamily: "inherit",
  background: C.surface, color: C.txt, outline: "none",
};

const CONTACT_SOURCE_BADGE: Record<string, { icon: string; title: string }> = {
  client: { icon: "🏥", title: "등록된 고객" },
  google: { icon: "G", title: "Google 연락처" },
  gmail_history: { icon: "📤", title: "지메일 보낸 기록" },
};

// ── 타입 ───────────────────────────────────────────────────
type MailStatus = "draft" | "ready" | "sent" | "failed";
type MailType = "quote" | "contract" | "conti" | "proposal" | "original_files" | "gallery" | "review_form" | "monthly_report" | "select_gallery";

type MailItem = {
  id: string; type: MailType; source_module: string; source_id?: string;
  hospital_name: string; contact_name: string;
  to_email: string; subject: string; body: string;
  attachments: { filename: string; content_type: string; content: string }[];
  links: { label: string; url: string }[];
  status: MailStatus; error_message: string;
  created_at: string; sent_at: string | null;
};

const TYPE_LABELS: Record<MailType, string> = {
  quote: "견적서", contract: "계약서", conti: "촬영 콘티",
  proposal: "제안서", original_files: "원본 파일", gallery: "보정본 갤러리",
  review_form: "리뷰 Form", monthly_report: "월간 리포트",
  select_gallery: "셀렉 갤러리",
};
const STATUS_LABELS: Record<MailStatus, string> = {
  draft: "임시저장", ready: "발송 대기", sent: "발송 완료", failed: "발송 실패",
};
const statusColor: Record<MailStatus, string> = {
  draft: "#9BB5B0", ready: "#155855", sent: "#22876A", failed: "#E85D2C",
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

// ═══════════════════════════════════════════════════════════
// 탭 1 — 임시저장 메일링 (기존 기능)
// ═══════════════════════════════════════════════════════════
function QueueTab() {
  const [items, setItems]             = useState<MailItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState("");
  const [dbStatus, setDbStatus]       = useState<null | { ok: boolean; tables: Record<string, boolean>; fatal?: string }>(null);
  const [selected, setSelected]       = useState<MailItem | null>(null);
  const [filterType, setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterHosp, setFilterHosp]   = useState(() => {
    if (typeof window === "undefined") return "";
    const p = new URLSearchParams(window.location.search);
    return p.get("hospital_name") || p.get("hospitalName") || "";
  });
  const [editing, setEditing]         = useState({ subject: "", body: "", to_email: "" });
  const [sending, setSending]         = useState(false);
  const [saveMsg, setSaveMsg]         = useState("");
  const [testResult, setTestResult]   = useState("");

  const checkDb = async () => {
    try { const res = await fetch("/api/db-check"); setDbStatus(await res.json()); } catch {}
  };

  const testInsert = async () => {
    setTestResult("저장 중...");
    try {
      const res  = await fetch("/api/mailing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "quote", source_module: "test", hospital_name: "테스트병원", subject: "[테스트] 연결 확인", body: "DB 연결 테스트 항목입니다." }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { setTestResult(`❌ 응답 파싱 실패: ${text.slice(0, 200)}`); return; }
      if (data.ok) { setTestResult(`✅ 저장 성공! ID: ${data.id}`); await load(); }
      else { setTestResult(`❌ 저장 실패: ${data.error}`); await checkDb(); }
    } catch (e: any) { setTestResult(`❌ 네트워크 오류: ${e.message}`); }
  };

  const load = async () => {
    setLoading(true); setLoadError("");
    const params = new URLSearchParams();
    if (filterType)   params.set("type", filterType);
    if (filterStatus) params.set("status", filterStatus);
    if (filterHosp)   params.set("hospital_name", filterHosp);
    try {
      const res  = await fetch(`/api/mailing?${params}`);
      const data = await res.json();
      if (data.ok) setItems(data.items || []);
      else { setLoadError(data.error || "DB 오류"); await checkDb(); }
    } catch (e: any) { setLoadError(e.message || "네트워크 오류"); }
    finally { setLoading(false); }
  };

  // client_id 파라미터가 있으면 해당 고객의 병원명으로 자동 필터
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const clientId = p.get("client_id") || p.get("clientId");
    if (!clientId || filterHosp) return;
    fetch(`/api/clients/${clientId}`)
      .then(r => r.json())
      .then(d => { if (d.ok && d.client) setFilterHosp(d.client.name || d.client.hospital_name || ""); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterType, filterStatus, filterHosp]);

  const openItem = (item: MailItem) => {
    setSelected(item);
    setEditing({ subject: item.subject, body: item.body, to_email: item.to_email });
    setSaveMsg("");
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaveMsg("");
    const res  = await fetch(`/api/mailing/${selected.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const data = await res.json();
    if (data.ok) {
      setSaveMsg("저장됨");
      setSelected(prev => prev ? { ...prev, ...editing } : prev);
      setItems(prev => prev.map(i => i.id === selected.id ? { ...i, ...editing } : i));
    } else setSaveMsg(`오류: ${data.error}`);
  };

  const sendMail = async () => {
    if (!selected) return;
    if (!editing.to_email) { setSaveMsg("수신 이메일을 먼저 입력해주세요."); return; }
    setSending(true); setSaveMsg("");
    await fetch(`/api/mailing/${selected.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const res  = await fetch("/api/mailing/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id }),
    });
    const data = await res.json();
    setSending(false);
    if (data.ok) {
      setSaveMsg("✓ 발송 완료!");
      const updated: MailItem = { ...selected, ...editing, status: "sent", sent_at: new Date().toISOString() };
      setSelected(updated);
      setItems(prev => prev.map(i => i.id === selected.id ? updated : i));
    } else {
      setSaveMsg(`발송 실패: ${data.error}`);
      setSelected(prev => prev ? { ...prev, status: "failed" } : prev);
      setItems(prev => prev.map(i => i.id === selected.id ? { ...i, status: "failed" } : i));
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm("메일을 휴지통으로 이동할까요? 30일 안에 복원할 수 있습니다.")) return;
    const response = await fetch(`/api/mailing/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.ok) { setSaveMsg(`삭제 실패: ${data.error || "알 수 없는 오류"}`); return; }
    if (selected?.id === id) setSelected(null);
    setItems(prev => prev.filter(i => i.id !== id));
    setSaveMsg("휴지통으로 이동했습니다.");
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 툴바 */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "10px 24px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...iS, width: "auto", minWidth: 130 }}>
          <option value="">전체 유형</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...iS, width: "auto", minWidth: 120 }}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={filterHosp} onChange={e => setFilterHosp(e.target.value)} placeholder="병원명 검색" style={{ ...iS, width: 160 }} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {testResult && <span style={{ fontSize: 12, fontWeight: 700, color: testResult.startsWith("✅") ? "#22876A" : testResult.startsWith("❌") ? C.orange : C.muted }}>{testResult}</span>}
          <button onClick={testInsert} className="pc-btn pc-btn--ghost pc-btn--sm">DB 테스트</button>
          <button onClick={load} className="pc-btn pc-btn--secondary pc-btn--sm">새로고침</button>
          <span style={{ fontSize: 12, color: C.muted }}>총 {items.length}건</span>
        </div>
      </div>

      {/* DB 상태 배너 */}
      {dbStatus && (
        <div style={{ background: dbStatus.ok ? "#F0FDF4" : "#FFF5F5", borderBottom: `1px solid ${dbStatus.ok ? "#B2E2CF" : "#FECACA"}`, padding: "8px 24px", display: "flex", gap: 10, alignItems: "center" }}>
          <span>{dbStatus.ok ? "✅" : "🚨"}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: dbStatus.ok ? "#22876A" : "#DC2626" }}>{dbStatus.ok ? "DB 연결 정상" : "DB 연결 실패"}</span>
          {dbStatus.fatal && <span style={{ fontSize: 11, color: "#DC2626" }}>{dbStatus.fatal}</span>}
          {dbStatus.tables && Object.entries(dbStatus.tables).map(([t, ok]) => (
            <span key={t} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99, background: (ok as boolean) ? "#D1FAE5" : "#FEE2E2", color: (ok as boolean) ? "#065F46" : "#DC2626", fontWeight: 700 }}>
              {(ok as boolean) ? "✓" : "✗"} {t}
            </span>
          ))}
        </div>
      )}
      {loadError && !dbStatus && (
        <div style={{ background: "#FFF5F5", borderBottom: "1px solid #FECACA", padding: "8px 24px", fontSize: 13, color: "#DC2626", fontWeight: 700 }}>🚨 {loadError}</div>
      )}

      {/* 목록 + 상세 */}
      <div className="pc-mobile-stack" style={{ flex: 1, display: "grid", gridTemplateColumns: selected ? "380px 1fr" : "1fr", overflow: "hidden" }}>
        <div style={{ borderRight: selected ? `1px solid ${C.border}` : "none", overflowY: "auto" }}>
          {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>불러오는 중...</div>}
          {!loading && items.length === 0 && (
            <div style={{ padding: 60, textAlign: "center", color: C.muted }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              메일링함이 비어 있습니다.<br/>
              <span style={{ fontSize: 12 }}>견적서, 계약서, 콘티 등을 생성하면 자동으로 저장됩니다.</span>
            </div>
          )}
          {items.map(item => (
            <div key={item.id} onClick={() => openItem(item)} style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: selected?.id === item.id ? C.mint : C.surface, transition: "background .15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, background: C.teal, color: "#fff", borderRadius: 99, padding: "2px 8px" }}>{TYPE_LABELS[item.type] || item.type}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: "2px 8px", border: `1px solid ${statusColor[item.status]}`, color: statusColor[item.status] }}>{STATUS_LABELS[item.status]}</span>
                </div>
                <span style={{ fontSize: 11, color: C.hint, whiteSpace: "nowrap" }}>{fmtDate(item.created_at)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.txt, marginBottom: 3, lineHeight: 1.3 }}>{item.subject}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{item.hospital_name} · {item.to_email || "이메일 미입력"}</div>
            </div>
          ))}
        </div>

        {selected && (
          <div style={{ padding: "24px 28px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, background: C.teal, color: "#fff", borderRadius: 99, padding: "3px 10px" }}>{TYPE_LABELS[selected.type] || selected.type}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: "3px 10px", border: `1px solid ${statusColor[selected.status]}`, color: statusColor[selected.status] }}>{STATUS_LABELS[selected.status]}</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{selected.hospital_name} · {fmtDate(selected.created_at)}</div>
              </div>
              <button onClick={() => deleteItem(selected.id)} className="pc-btn pc-btn--danger pc-btn--sm">삭제</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>수신 이메일 *</label>
              <input value={editing.to_email} onChange={e => setEditing(p => ({ ...p, to_email: e.target.value }))} placeholder="photoclnic@gmail.com" style={iS} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>메일 제목</label>
              <input value={editing.subject} onChange={e => setEditing(p => ({ ...p, subject: e.target.value }))} style={iS} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>메일 본문</label>
              <textarea value={editing.body} onChange={e => setEditing(p => ({ ...p, body: e.target.value }))} rows={8} style={{ ...iS, resize: "vertical", lineHeight: 1.7 }} />
            </div>

            {selected.links?.length > 0 && (
              <div style={{ marginBottom: 16, background: C.mint, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 8 }}>포함된 링크</div>
                {selected.links.map((l, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: C.txt }}>{l.label}</span><br />
                    <span style={{ wordBreak: "break-all" }}>{l.url}</span>
                  </div>
                ))}
              </div>
            )}
            {selected.attachments?.length > 0 && (
              <div style={{ marginBottom: 16, background: C.mint, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 8 }}>첨부파일</div>
                {selected.attachments.map((a, i) => <div key={i} style={{ fontSize: 12, color: C.muted }}>{a.filename}</div>)}
              </div>
            )}
            {selected.status === "failed" && selected.error_message && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "#FFF0EB", border: `1px solid #FACCB8`, borderRadius: 8, fontSize: 12, color: C.orange }}>⚠ {selected.error_message}</div>
            )}
            {selected.status === "sent" && selected.sent_at && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "#EAFAF4", border: `1px solid #B2E2CF`, borderRadius: 8, fontSize: 12, color: "#22876A", fontWeight: 700 }}>✓ {fmtDate(selected.sent_at)} 발송 완료</div>
            )}
            {saveMsg && <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: saveMsg.includes("완료") ? "#22876A" : C.orange }}>{saveMsg}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveEdit} className="pc-btn pc-btn--secondary pc-btn--lg" style={{ flex: 1 }}>임시 저장</button>
              <button onClick={sendMail} disabled={sending || selected.status === "sent"} className="pc-btn pc-btn--orange pc-btn--lg" style={{ flex: 2 }}>
                {sending ? "발송 중..." : selected.status === "sent" ? "발송 완료" : "📨 메일 발송"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnSm: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: 8, fontSize: 12,
  fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};

// ═══════════════════════════════════════════════════════════
// 탭 2 — 브랜드 메일 보내기 (delivery-mail 통합)
// ═══════════════════════════════════════════════════════════
const DEFAULT_DELIVERY_BODY = `촬영 보정본 공유드립니다.
아래 링크를 통해 고화질 원본 파일을 다운로드 하실 수 있습니다.
링크는 영구적으로 보관되나, 30일 이내로 다운받으시길 권장 드립니다.`;

function BrandMailTab() {
  const [hospitalName, setHospitalName] = useState("");
  const [toName,       setToName]       = useState("");
  const [toEmail,      setToEmail]      = useState("");
  const [shootDate,    setShootDate]    = useState("");
  const [packageName,  setPackageName]  = useState("");
  const [fileCount,    setFileCount]    = useState("");
  const [nasLink,      setNasLink]      = useState("");
  const [message,      setMessage]      = useState(DEFAULT_DELIVERY_BODY);
  const [preview,      setPreview]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [result,       setResult]       = useState<"success" | "error" | null>(null);
  const [errMsg,       setErrMsg]       = useState("");

  const dir = useContactDirectory();

  const handleSend = async () => {
    if (!toEmail || !hospitalName || !nasLink) { setErrMsg("수신 이메일, 고객, NAS 링크는 필수입니다"); return; }
    setSending(true); setErrMsg(""); setResult(null);
    try {
      const res  = await fetch("/api/send-delivery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: toEmail, toName, hospitalName, shootDate, packageName, fileCount: fileCount ? Number(fileCount) : null, nasLink, message }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult("success");
    } catch (e: any) { setErrMsg(e.message); setResult("error"); }
    finally { setSending(false); }
  };

  const resetForm = () => {
    setHospitalName(""); setToName(""); setToEmail(""); setShootDate("");
    setPackageName(""); setFileCount(""); setNasLink(""); setMessage(DEFAULT_DELIVERY_BODY);
    setResult(null); setErrMsg("");
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      <div className="pc-mobile-stack" style={{ maxWidth: preview ? 1120 : 580, margin: "0 auto", display: "grid", gridTemplateColumns: preview ? "1fr 1fr" : "1fr", gap: 24, alignItems: "start" }}>

        {/* ── 입력 폼 ─────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* 미리보기 토글 */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setPreview(p => !p)} className={`pc-btn pc-btn--sm ${preview ? "pc-btn--primary" : "pc-btn--secondary"}`}>
              {preview ? "미리보기 숨기기" : "📧 미리보기"}
            </button>
          </div>

          {/* 사진 전달 정보 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📋 사진 전달 정보</div>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>고객 *</label>
                  <input value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="고객사명" style={iS} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>촬영일</label>
                  <input type="date" value={shootDate} onChange={e => setShootDate(e.target.value)} style={iS} />
                </div>
              </div>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>촬영 내용</label>
                  <input value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="Premium 촬영 내용" style={iS} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>전달 수량 (장)</label>
                  <input type="number" value={fileCount} onChange={e => setFileCount(e.target.value)} placeholder="120" style={iS} />
                </div>
              </div>
            </div>
          </div>

          {/* 받는 분 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>👤 받는 분</div>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>담당자명</label>
                  <input value={toName} onChange={e => setToName(e.target.value)} placeholder="정연호 실장님" style={iS} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>이메일 *</label>
                  <div style={{ position: "relative" }} ref={dir.dropdownRef}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="email" value={toEmail}
                        onChange={e => { setToEmail(e.target.value); dir.setSearch(e.target.value); dir.setShowDropdown(true); }}
                        onFocus={() => { dir.setShowDropdown(true); dir.load(); }}
                        placeholder="photoclnic@gmail.com" style={{ ...iS, flex: 1 }} />
                      <button onClick={() => { dir.setShowDropdown(!dir.showDropdown); dir.load(); }}
                        className="pc-btn pc-btn--ghost pc-btn--sm"
                        style={{ padding: "0 10px", flexShrink: 0 }}
                        title="고객·연락처 검색">👥</button>
                    </div>
                    {dir.showDropdown && dir.filtered.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,.1)", marginTop: 4, maxHeight: 360, overflowY: "auto" }}>
                        <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>
                          <input value={dir.search} onChange={e => dir.setSearch(e.target.value)} placeholder="이름·이메일·회사 검색..." style={{ ...iS, height: 38, padding: "8px 12px" }} />
                          {dir.session && (
                            <button type="button" onClick={dir.loadGmailHistory} disabled={dir.gmailHistoryState === "loading"}
                              style={{ marginTop: 6, width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.mint, color: C.teal, fontSize: 11, fontWeight: 700, cursor: dir.gmailHistoryState === "loading" ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                              {dir.gmailHistoryState === "loading" ? "📤 지메일 기록 검색 중..." : dir.gmailHistoryState === "done" ? "✓ 지메일 기록 반영됨" : "📤 지메일 보낸기록에서 더 찾기"}
                            </button>
                          )}
                        </div>
                        {dir.filtered.map((c, i) => (
                          <div key={i}
                            onClick={() => { setToEmail(c.email); setToName(c.name); setHospitalName(prev => prev || c.org); dir.setShowDropdown(false); dir.setSearch(""); }}
                            style={{ padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 4 }}
                            onMouseEnter={e => (e.currentTarget.style.background = C.mint)}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.txt, display: "flex", alignItems: "center", gap: 6 }}>
                              <span title={CONTACT_SOURCE_BADGE[c.source]?.title} style={{ fontSize: 11 }}>{CONTACT_SOURCE_BADGE[c.source]?.icon}</span>
                              {c.name}
                            </span>
                            <span style={{ fontSize: 13, color: C.muted }}>{c.email}</span>
                            {c.org && <span style={{ fontSize: 12, color: C.hint }}>{c.org}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.hint, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                    <span>🏥 등록된 고객 자동 연동{dir.session ? " · ✓ Google 연락처 연동됨" : ""}{dir.loaded ? ` · 총 ${dir.contacts.length}명` : ""}</span>
                    {dir.session ? (
                      <button onClick={() => window.location.href = "/api/auth/signout"} style={{ background: "none", border: "none", fontSize: 11, color: C.hint, cursor: "pointer", padding: 0 }}>Google 연동 해제</button>
                    ) : (
                      <button onClick={() => window.location.href = "/api/auth/google"} style={{ background: "none", border: "none", fontSize: 11, color: C.teal, fontWeight: 700, cursor: "pointer", padding: 0 }}>+ Google 연락처 연동</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* NAS 링크 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>🔗 다운로드 링크</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>NAS 공유 링크를 붙여넣으세요</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <input value={nasLink} onChange={e => setNasLink(e.target.value)} placeholder="https://nas.photoclinic.kr/share/..." style={{ ...iS, fontSize: 12 }} />
              {nasLink && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.teal }}>
                  <span>✓</span>
                  <a href={nasLink} target="_blank" rel="noopener" style={{ color: C.teal, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: 320 }}>{nasLink}</a>
                </div>
              )}
            </div>
          </div>

          {/* 본문 편집 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>✉️ 본문 편집</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>다운로드 버튼 위에 표시되는 내용을 수정하세요</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                style={{ ...iS, resize: "vertical", lineHeight: 1.8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <div style={{ fontSize: 11, color: C.hint }}>{message.length}자</div>
                <button onClick={() => setMessage(DEFAULT_DELIVERY_BODY)}
                  style={{ fontSize: 11, color: C.hint, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  기본 문구로 초기화
                </button>
              </div>
            </div>
          </div>

          {errMsg && <div style={{ padding: "11px 14px", background: "#FFF0EB", border: `1px solid #FACCB8`, borderRadius: 9, fontSize: 12, color: C.orange }}>⚠ {errMsg}</div>}

          {result === "success" ? (
            <div style={{ padding: "16px 20px", background: C.mint, border: `1px solid ${C.teal}`, borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 4 }}>메일 발송 완료!</div>
              <div style={{ fontSize: 12, color: C.muted }}>{toEmail} 로 파일 전송 메일이 발송됐어요</div>
              <button onClick={resetForm} style={{ marginTop: 12, height: 36, padding: "0 20px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>새 메일 작성</button>
            </div>
          ) : (
            <button onClick={handleSend} disabled={sending || !toEmail || !hospitalName || !nasLink}
              style={{ width: "100%", height: 50, background: sending ? C.hint : C.orange, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: sending || !toEmail || !hospitalName || !nasLink ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {sending ? "발송 중..." : `📨 ${hospitalName || "고객"}에 사진 전달 메일 발송`}
            </button>
          )}
        </div>

        {/* ── 메일 미리보기 ─────────────────────────── */}
        {preview && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", position: "sticky", top: 0 }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📧 메일 미리보기</div>
              <div style={{ fontSize: 11, color: C.muted }}>실제 발송될 메일 디자인</div>
            </div>
            <div style={{ padding: 16, background: "#EDF5F3" }}>
              <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden" }}>
                {/* 헤더 */}
                <div style={{ background: C.teal, padding: "20px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 5 }}>PHOTO CLINIC · 포토클리닉</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 3 }}>병원의 멋진 이야기 공유드립니다</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{new Date().toLocaleDateString("ko-KR")}</div>
                </div>
                {/* 본문 */}
                <div style={{ padding: "20px 24px" }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: C.txt, margin: "0 0 4px" }}>
                    안녕하세요. 병원이야기를 전하는 포토클리닉입니다.
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.txt, margin: "0 0 12px" }}>
                    {toName || hospitalName || "원장"} 원장님.
                  </p>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8, margin: "0 0 12px", whiteSpace: "pre-line" }}>
                    {message}
                  </div>
                  {(packageName || fileCount) && (
                    <div style={{ background: C.mint, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                      {packageName && <div style={{ fontSize: 11, marginBottom: 3 }}><span style={{ color: C.hint, marginRight: 8, fontWeight: 700 }}>폴더 구성</span><span style={{ fontWeight: 700, color: C.txt }}>{packageName}</span></div>}
                      {fileCount && <div style={{ fontSize: 11 }}><span style={{ color: C.hint, marginRight: 8, fontWeight: 700 }}>전달 수량</span><span style={{ fontWeight: 800, color: C.orange }}>총 {fileCount}컷</span></div>}
                    </div>
                  )}
                  <div style={{ textAlign: "center", margin: "14px 0" }}>
                    <div style={{ background: C.orange, color: "#fff", display: "inline-block", padding: "9px 22px", borderRadius: 8, fontSize: 11, fontWeight: 800 }}>자료 다운로드</div>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.8, margin: "12px 0" }}>
                    덕분에 즐거운 촬영이었습니다.<br/>
                    긴 시간 촬영, 끝까지 함께 잘 해주셔서 감사합니다.
                  </p>
                  <div style={{ textAlign: "center", margin: "14px 0" }}>
                    <div style={{ fontSize: 11, color: C.hint, marginBottom: 7 }}>촬영 경험이 만족스러우셨다면 후기를 남겨주세요 🙏</div>
                    <div style={{ background: C.teal, color: "#fff", display: "inline-block", padding: "9px 22px", borderRadius: 8, fontSize: 11, fontWeight: 800 }}>리뷰 작성하기</div>
                  </div>
                  <p style={{ fontSize: 11, color: C.hint, borderTop: `1px solid #EEF4F3`, paddingTop: 10, margin: "10px 0 0", lineHeight: 1.8 }}>
                    문의사항은 언제든지 연락 주세요. 감사합니다.<br/>포토클리닉 대표 정연호 드림.
                  </p>
                </div>
                {/* 푸터 */}
                <div style={{ background: C.mint, padding: "16px 20px", textAlign: "center", borderTop: `1px solid ${C.border}` }}>
                  <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" style={{ height: 24, display: "block", margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 3 }}>사진으로 병원이야기를 전합니다, 포토클리닉</div>
                  <div style={{ fontSize: 11, color: C.hint }}>PHOTO CLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 탭 3 — 브랜드 메일 (자유형 발송)
// ═══════════════════════════════════════════════════════════
function CustomBrandMailTab() {
  const [toName,      setToName]      = useState("");
  const [toEmail,     setToEmail]     = useState("");
  const [subject,     setSubject]     = useState("");
  const [body,        setBody]        = useState("");
  const [links,       setLinks]       = useState<{ label: string; url: string }[]>([{ label: "", url: "" }]);
  const [attachments, setAttachments] = useState<{ filename: string; content_type: string; content: string; size: number }[]>([]);
  const [preview,     setPreview]     = useState(true);
  const [sending,     setSending]     = useState(false);
  const [drafting,    setDrafting]    = useState(false);
  const [draftSaved,  setDraftSaved]  = useState(false);
  const [result,      setResult]      = useState<"success" | "error" | null>(null);
  const [errMsg,      setErrMsg]      = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const dir = useContactDirectory();

  const [galleries, setGalleries] = useState<any[]>([]);
  const [galleriesLoaded, setGalleriesLoaded] = useState(false);
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [gallerySearch, setGallerySearch] = useState("");

  const loadGalleries = async () => {
    if (galleriesLoaded) return;
    setGalleriesLoaded(true);
    try {
      const res = await fetch("/api/select-galleries");
      const data = await res.json();
      if (data.ok) setGalleries(data.galleries);
    } catch {}
  };

  const filteredGalleries = galleries.filter(g =>
    (g.hospital_name ?? g.title ?? "").toLowerCase().includes(gallerySearch.toLowerCase()) ||
    (g.shooting_name ?? "").toLowerCase().includes(gallerySearch.toLowerCase())
  ).slice(0, 8);

  const addGalleryLink = (gallery: any) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/select/${gallery.share_token}`;
    setLinks(prev => {
      const empties = prev.filter(l => !l.label.trim() && !l.url.trim());
      const filled = prev.filter(l => l.label.trim() || l.url.trim());
      return [...filled, { label: "사진 셀렉하기", url }, ...(empties.length ? [] : [{ label: "", url: "" }])];
    });
    setShowGalleryPicker(false);
    setGallerySearch("");
  };

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const loaded: typeof attachments = [];
    for (const f of arr) {
      const content = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(f);
      });
      loaded.push({ filename: f.name, content_type: f.type || "application/octet-stream", content, size: f.size });
    }
    setAttachments(prev => [...prev, ...loaded]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const fmtSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

  const updateLink = (index: number, field: "label" | "url", value: string) =>
    setLinks(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  const addLink = () => setLinks(prev => [...prev, { label: "", url: "" }]);
  const removeLink = (index: number) => setLinks(prev => prev.filter((_, i) => i !== index));
  const filledLinks = links.filter(l => l.label.trim() && l.url.trim());

  const handleSaveDraft = async () => {
    if (!subject) { setErrMsg("제목은 필수입니다."); return; }
    setDrafting(true); setErrMsg(""); setDraftSaved(false);
    try {
      const res = await fetch("/api/mailing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "brand_mail",
          source_module: "brand-mail",
          hospital_name: toName || toEmail || "미입력",
          contact_name: toName,
          to_email: toEmail,
          subject,
          body,
          links: filledLinks,
          attachments: attachments.map(({ filename, content_type, content }) => ({ filename, content_type, content })),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
    } catch (e: any) { setErrMsg(e.message); }
    finally { setDrafting(false); }
  };

  useSaveShortcut(handleSaveDraft);

  const handleSend = async () => {
    if (!toEmail || !subject || !body) { setErrMsg("이메일, 제목, 본문은 필수입니다."); return; }
    setSending(true); setErrMsg(""); setResult(null);
    try {
      const res = await fetch("/api/send-brand-mail", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmail, toName, subject, body,
          links: filledLinks,
          attachments: attachments.map(({ filename, content_type, content }) => ({ filename, content_type, content })),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult("success");
    } catch (e: any) { setErrMsg(e.message); setResult("error"); }
    finally { setSending(false); }
  };

  const resetForm = () => {
    setToName(""); setToEmail(""); setSubject(""); setBody("");
    setLinks([{ label: "", url: "" }]); setAttachments([]);
    setResult(null); setErrMsg("");
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      <div className="pc-mobile-stack" style={{ maxWidth: preview ? 1120 : 580, margin: "0 auto", display: "grid", gridTemplateColumns: preview ? "1fr 1fr" : "1fr", gap: 24, alignItems: "start" }}>

        {/* ── 입력 폼 ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setPreview(p => !p)} className={`pc-btn pc-btn--sm ${preview ? "pc-btn--primary" : "pc-btn--secondary"}`}>
              {preview ? "미리보기 숨기기" : "📧 미리보기"}
            </button>
          </div>

          {/* 받는 분 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>👤 받는 분</div>
            </div>
            <div className="pc-mobile-form-grid" style={{ padding: "18px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>이름</label>
                <input value={toName} onChange={e => setToName(e.target.value)} placeholder="원장님 / 담당자" style={iS} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>이메일 *</label>
                <div ref={dir.dropdownRef} style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="email" value={toEmail}
                      onChange={e => { setToEmail(e.target.value); dir.setSearch(e.target.value); dir.setShowDropdown(true); }}
                      onFocus={() => { dir.setShowDropdown(true); dir.load(); }}
                      placeholder="example@gmail.com" style={{ ...iS, flex: 1 }} />
                    <button onClick={() => { dir.setShowDropdown(!dir.showDropdown); dir.load(); }}
                      style={{ height: 38, padding: "0 10px", background: C.mint, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, cursor: "pointer", flexShrink: 0 }}
                      title="고객·연락처 검색">👥</button>
                  </div>
                  {dir.showDropdown && dir.filtered.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,.1)", marginTop: 4, maxHeight: 260, overflowY: "auto" }}>
                      <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>
                        <input value={dir.search} onChange={e => dir.setSearch(e.target.value)} placeholder="이름·이메일 검색..." style={{ ...iS, height: 34, padding: "6px 10px" }} />
                        {dir.session && (
                          <button type="button" onClick={dir.loadGmailHistory} disabled={dir.gmailHistoryState === "loading"}
                            style={{ marginTop: 5, width: "100%", padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.mint, color: C.teal, fontSize: 11, fontWeight: 700, cursor: dir.gmailHistoryState === "loading" ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                            {dir.gmailHistoryState === "loading" ? "📤 지메일 기록 검색 중..." : dir.gmailHistoryState === "done" ? "✓ 지메일 기록 반영됨" : "📤 지메일 보낸기록에서 더 찾기"}
                          </button>
                        )}
                      </div>
                      {dir.filtered.map((c, i) => (
                        <div key={i}
                          onClick={() => { setToEmail(c.email); setToName(c.name); dir.setShowDropdown(false); dir.setSearch(""); }}
                          style={{ padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 3 }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.mint)}
                          onMouseLeave={e => (e.currentTarget.style.background = "")}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.txt, display: "flex", alignItems: "center", gap: 6 }}>
                            <span title={CONTACT_SOURCE_BADGE[c.source]?.title} style={{ fontSize: 11 }}>{CONTACT_SOURCE_BADGE[c.source]?.icon}</span>
                            {c.name}
                          </span>
                          <span style={{ fontSize: 12, color: C.muted }}>{c.email}</span>
                          {c.org && <span style={{ fontSize: 11, color: C.hint }}>{c.org}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.hint, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                  <span>🏥 등록된 고객 자동 연동{dir.session ? " · ✓ Google 연락처 연동됨" : ""}</span>
                  {!dir.session && (
                    <button onClick={() => window.location.href = "/api/auth/google"} style={{ background: "none", border: "none", fontSize: 11, color: C.teal, fontWeight: 700, cursor: "pointer", padding: 0 }}>+ Google 연락처 연동</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 제목 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>✏️ 메일 제목 *</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="예: 콘티 전달드립니다 / 계약서 검토 요청드립니다" style={iS} />
            </div>
          </div>

          {/* 본문 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📝 본문 *</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={7}
                placeholder={"안녕하세요.\n촬영 콘티를 전달드립니다.\n검토 후 피드백 부탁드립니다.\n\n감사합니다."}
                style={{ ...iS, resize: "vertical", lineHeight: 1.8 }} />
              <div style={{ fontSize: 11, color: C.hint, marginTop: 4, textAlign: "right" }}>{body.length}자</div>
            </div>
          </div>

          {/* 링크 버튼 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>🔗 링크 버튼 <span style={{ fontWeight: 400, color: C.hint }}>(선택, 여러 개 추가 가능)</span></div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>메일 본문에 클릭 가능한 버튼을 추가합니다</div>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {links.map((link, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, alignItems: "end" }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>버튼 텍스트</label>
                    <input value={link.label} onChange={e => updateLink(i, "label", e.target.value)} placeholder="자료 확인하기" style={iS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>링크 URL</label>
                    <input value={link.url} onChange={e => updateLink(i, "url", e.target.value)} placeholder="https://..." style={{ ...iS, fontSize: 12 }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLink(i)}
                    disabled={links.length === 1}
                    title="이 링크 삭제"
                    style={{ height: 42, width: 36, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: links.length === 1 ? C.hint : C.orange, cursor: links.length === 1 ? "not-allowed" : "pointer", fontSize: 14 }}
                  >✕</button>
                </div>
              ))}
              <button
                type="button"
                onClick={addLink}
                style={{ alignSelf: "flex-start", padding: "7px 14px", border: `1px dashed ${C.teal}`, borderRadius: 8, background: "transparent", color: C.teal, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >+ 링크 추가</button>
            </div>
          </div>

          {/* 사진 셀렉 링크 — 별도 박스 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📸 사진 셀렉 링크 <span style={{ fontWeight: 400, color: C.hint }}>(선택)</span></div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>기존 셀렉 갤러리를 골라 위 링크 버튼 목록에 바로 추가합니다 — 고객이 웹에서 선택하거나, 선택한 파일을 업로드하는 방식 둘 다 지원됩니다.</div>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                onClick={() => { setShowGalleryPicker(v => !v); loadGalleries(); }}
                style={{ alignSelf: "flex-start", padding: "8px 16px", border: `1px solid ${C.teal}`, borderRadius: 8, background: showGalleryPicker ? C.teal : C.mint, color: showGalleryPicker ? "#fff" : C.teal, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >{showGalleryPicker ? "갤러리 목록 닫기 ▲" : "갤러리 목록에서 고르기 ▼"}</button>

              {showGalleryPicker && (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                    <input value={gallerySearch} onChange={e => setGallerySearch(e.target.value)} placeholder="고객명·촬영명 검색..." style={{ ...iS, height: 36, padding: "6px 10px" }} />
                  </div>
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    {!galleriesLoaded ? (
                      <div style={{ padding: "16px", textAlign: "center", fontSize: 12, color: C.hint }}>불러오는 중...</div>
                    ) : filteredGalleries.length === 0 ? (
                      <div style={{ padding: "16px", textAlign: "center", fontSize: 12, color: C.hint }}>셀렉 갤러리가 없습니다</div>
                    ) : filteredGalleries.map((g) => (
                      <div key={g.id}
                        onClick={() => addGalleryLink(g)}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 2 }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.mint)}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.txt }}>{g.hospital_name ?? g.title}</span>
                        {g.shooting_name && <span style={{ fontSize: 11, color: C.muted }}>{g.shooting_name}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 파일 첨부 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📎 파일 첨부 <span style={{ fontWeight: 400, color: C.hint }}>(선택)</span></div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>PDF, 이미지, 문서 등 — 드래그 또는 클릭</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", cursor: "pointer", background: "#FAFFFE" }}>
                <input ref={fileRef} type="file" multiple style={{ display: "none" }}
                  onChange={e => e.target.files && handleFiles(e.target.files)} />
                <div style={{ fontSize: 22, marginBottom: 6 }}>📁</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>파일을 드래그하거나 클릭</div>
                <div style={{ fontSize: 11, color: C.hint, marginTop: 4 }}>PDF, 이미지, 문서, 영상 등 모든 형식 지원</div>
              </div>
              {attachments.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {attachments.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: C.mint, borderRadius: 8 }}>
                      <span style={{ fontSize: 16 }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.filename}</div>
                        <div style={{ fontSize: 11, color: C.hint }}>{fmtSize(a.size)}</div>
                      </div>
                      <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ border: "none", background: "none", color: C.hint, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {errMsg && <div style={{ padding: "11px 14px", background: "#FFF0EB", border: `1px solid #FACCB8`, borderRadius: 9, fontSize: 12, color: C.orange }}>⚠ {errMsg}</div>}
          {draftSaved && <div style={{ padding: "11px 14px", background: C.mint, border: `1px solid ${C.teal}`, borderRadius: 9, fontSize: 12, color: C.teal, fontWeight: 700 }}>✅ 임시저장 완료 — 임시저장 메일링 탭에서 확인하세요</div>}

          {result === "success" ? (
            <div style={{ padding: "16px 20px", background: C.mint, border: `1px solid ${C.teal}`, borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 4 }}>메일 발송 완료!</div>
              <div style={{ fontSize: 12, color: C.muted }}>{toEmail} 으로 브랜드 메일이 발송됐어요</div>
              <button onClick={resetForm} style={{ marginTop: 12, height: 36, padding: "0 20px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>새 메일 작성</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleSaveDraft} disabled={drafting || !subject}
                style={{ flex: "0 0 auto", height: 50, padding: "0 20px", background: C.surface, color: drafting ? C.hint : C.teal, border: `1.5px solid ${C.teal}`, borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: drafting || !subject ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {drafting ? "저장 중..." : "💾 임시 저장"}
              </button>
              <button onClick={handleSend} disabled={sending || !toEmail || !subject || !body}
                style={{ flex: 1, height: 50, background: sending ? C.hint : C.orange, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: sending || !toEmail || !subject || !body ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {sending ? "발송 중..." : `📨 ${toName || toEmail || "받는 분"}에게 브랜드 메일 발송`}
              </button>
            </div>
          )}
        </div>

        {/* ── 미리보기 ── */}
        {preview && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", position: "sticky", top: 0 }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📧 메일 미리보기</div>
              <div style={{ fontSize: 11, color: C.muted }}>실제 발송될 메일 디자인</div>
            </div>
            <div style={{ padding: 16, background: "#EDF5F3" }}>
              <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: C.teal, padding: "20px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 5 }}>PHOTO CLINIC · 포토클리닉</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{subject || "메일 제목을 입력하세요"}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{new Date().toLocaleDateString("ko-KR")}</div>
                </div>
                <div style={{ padding: "20px 24px" }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: C.txt, margin: "0 0 4px" }}>안녕하세요. 병원이야기를 전하는 포토클리닉입니다.</p>
                  {toName && <p style={{ fontSize: 12, fontWeight: 700, color: C.txt, margin: "0 0 12px" }}>{toName}님.</p>}
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.9, margin: "0 0 16px", whiteSpace: "pre-line" }}>
                    {body || "본문 내용이 여기에 표시됩니다."}
                  </div>
                  {filledLinks.length > 0 && (
                    <div style={{ textAlign: "center", margin: "16px 0", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                      {filledLinks.map((link, i) => (
                        <div key={i} style={{ background: C.orange, color: "#fff", display: "inline-block", padding: "9px 22px", borderRadius: 8, fontSize: 11, fontWeight: 800 }}>{link.label}</div>
                      ))}
                    </div>
                  )}
                  {attachments.length > 0 && (
                    <div style={{ background: C.mint, borderRadius: 8, padding: "10px 14px", marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 6 }}>📎 첨부파일 {attachments.length}개</div>
                      {attachments.map((a, i) => <div key={i} style={{ fontSize: 11, color: C.muted }}>{a.filename} ({fmtSize(a.size)})</div>)}
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: C.hint, borderTop: `1px solid #EEF4F3`, paddingTop: 10, margin: "14px 0 0", lineHeight: 1.8 }}>
                    문의사항은 언제든지 연락 주세요. 감사합니다.<br/>포토클리닉 대표 정연호 드림.
                  </p>
                </div>
                <div style={{ background: C.mint, padding: "16px 20px", textAlign: "center", borderTop: `1px solid ${C.border}` }}>
                  <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" style={{ height: 24, display: "block", margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 3 }}>사진으로 병원이야기를 전합니다, 포토클리닉</div>
                  <div style={{ fontSize: 11, color: C.hint }}>PHOTO CLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 탭 4 — 후기 요청 메일 (후기만 발송)
// ═══════════════════════════════════════════════════════════
const DEFAULT_REVIEW_BODY = `촬영에 함께해주셔서 진심으로 감사드립니다.

포토클리닉과 함께한 경험이 어떠셨는지 짧게 남겨주시면 큰 도움이 됩니다.
남겨주신 후기는 더 좋은 촬영 경험을 준비하는 데 소중하게 참고하겠습니다.`;

function ReviewOnlyMailTab() {
  const [hospitalName, setHospitalName] = useState("");
  const [toName,       setToName]       = useState("");
  const [toEmail,      setToEmail]      = useState("");
  const [shootDate,    setShootDate]    = useState("");
  const [subject,      setSubject]      = useState("[포토클리닉] 촬영 후기 부탁드립니다");
  const [message,      setMessage]      = useState(DEFAULT_REVIEW_BODY);
  const [preview,      setPreview]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [drafting,     setDrafting]     = useState(false);
  const [draftSaved,   setDraftSaved]   = useState(false);
  const [result,       setResult]       = useState<"success" | "error" | null>(null);
  const [errMsg,       setErrMsg]       = useState("");
  const [origin,       setOrigin]       = useState("");

  const dir = useContactDirectory();

  const reviewUrl = `${origin}/review?hospital=${encodeURIComponent(hospitalName)}&name=${encodeURIComponent(toName)}`;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const resetForm = () => {
    setHospitalName(""); setToName(""); setToEmail(""); setShootDate("");
    setSubject("[포토클리닉] 촬영 후기 부탁드립니다");
    setMessage(DEFAULT_REVIEW_BODY);
    setResult(null); setErrMsg(""); setDraftSaved(false);
  };

  const saveDraft = async () => {
    if (!hospitalName || !subject) { setErrMsg("고객과 제목은 필수입니다."); return; }
    setDrafting(true); setErrMsg(""); setDraftSaved(false);
    try {
      const res = await fetch("/api/mailing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "review_form",
          source_module: "review-mail",
          hospital_name: hospitalName,
          contact_name: toName,
          to_email: toEmail,
          subject,
          body: message,
          links: [{ label: "리뷰 작성하기", url: reviewUrl, color: C.teal }],
          attachments: [],
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
    } catch (e: any) { setErrMsg(e.message); }
    finally { setDrafting(false); }
  };

  useSaveShortcut(saveDraft);

  const handleSend = async () => {
    if (!toEmail || !hospitalName || !subject || !message) {
      setErrMsg("고객, 이메일, 제목, 본문은 필수입니다.");
      return;
    }
    setSending(true); setErrMsg(""); setResult(null);
    try {
      const res = await fetch("/api/send-brand-mail", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmail,
          toName: toName || hospitalName,
          subject,
          body: message,
          links: [{ label: "리뷰 작성하기", url: reviewUrl, color: C.teal }],
          attachments: [],
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult("success");
    } catch (e: any) { setErrMsg(e.message); setResult("error"); }
    finally { setSending(false); }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      <div className="pc-mobile-stack" style={{ maxWidth: preview ? 1120 : 580, margin: "0 auto", display: "grid", gridTemplateColumns: preview ? "1fr 1fr" : "1fr", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setPreview(p => !p)} className={`pc-btn pc-btn--sm ${preview ? "pc-btn--primary" : "pc-btn--secondary"}`}>
              {preview ? "미리보기 숨기기" : "📧 미리보기"}
            </button>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>⭐ 후기 요청 정보</div>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>고객 *</label>
                  <input value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="고객사명" style={iS} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>촬영일</label>
                  <input type="date" value={shootDate} onChange={e => setShootDate(e.target.value)} style={iS} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>메일 제목 *</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="[포토클리닉] 촬영 후기 부탁드립니다" style={iS} />
              </div>
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>👤 받는 분</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>담당자명</label>
                  <input value={toName} onChange={e => setToName(e.target.value)} placeholder="정연호 실장님" style={iS} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>이메일 *</label>
                  <div style={{ position: "relative" }} ref={dir.dropdownRef}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="email" value={toEmail}
                        onChange={e => { setToEmail(e.target.value); dir.setSearch(e.target.value); dir.setShowDropdown(true); }}
                        onFocus={() => { dir.setShowDropdown(true); dir.load(); }}
                        placeholder="photoclinic@gmail.com" style={{ ...iS, flex: 1 }} />
                      <button onClick={() => { dir.setShowDropdown(!dir.showDropdown); dir.load(); }}
                        className="pc-btn pc-btn--ghost pc-btn--sm"
                        style={{ padding: "0 10px", flexShrink: 0 }}
                        title="고객·연락처 검색">👥</button>
                    </div>
                    {dir.showDropdown && dir.filtered.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,.1)", marginTop: 4, maxHeight: 360, overflowY: "auto" }}>
                        <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>
                          <input value={dir.search} onChange={e => dir.setSearch(e.target.value)} placeholder="이름·이메일·회사 검색..." style={{ ...iS, height: 38, padding: "8px 12px" }} />
                          {dir.session && (
                            <button type="button" onClick={dir.loadGmailHistory} disabled={dir.gmailHistoryState === "loading"}
                              style={{ marginTop: 6, width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.mint, color: C.teal, fontSize: 11, fontWeight: 700, cursor: dir.gmailHistoryState === "loading" ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                              {dir.gmailHistoryState === "loading" ? "📤 지메일 기록 검색 중..." : dir.gmailHistoryState === "done" ? "✓ 지메일 기록 반영됨" : "📤 지메일 보낸기록에서 더 찾기"}
                            </button>
                          )}
                        </div>
                        {dir.filtered.map((c, i) => (
                          <div key={i}
                            onClick={() => { setToEmail(c.email); setToName(c.name); setHospitalName(prev => prev || c.org); dir.setShowDropdown(false); dir.setSearch(""); }}
                            style={{ padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 4 }}
                            onMouseEnter={e => (e.currentTarget.style.background = C.mint)}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.txt, display: "flex", alignItems: "center", gap: 6 }}>
                              <span title={CONTACT_SOURCE_BADGE[c.source]?.title} style={{ fontSize: 11 }}>{CONTACT_SOURCE_BADGE[c.source]?.icon}</span>
                              {c.name}
                            </span>
                            <span style={{ fontSize: 13, color: C.muted }}>{c.email}</span>
                            {c.org && <span style={{ fontSize: 12, color: C.hint }}>{c.org}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.hint, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                    <span>🏥 등록된 고객 자동 연동{dir.session ? " · ✓ Google 연락처 연동됨" : ""}</span>
                    {!dir.session && (
                      <button onClick={() => window.location.href = "/api/auth/google"} style={{ background: "none", border: "none", fontSize: 11, color: C.teal, fontWeight: 700, cursor: "pointer", padding: 0 }}>+ Google 연락처 연동</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>🔗 후기 작성 링크</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>고객과 담당자명이 링크에 자동 반영됩니다</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <input value={reviewUrl} readOnly style={{ ...iS, fontSize: 12, color: C.muted, background: "#FAFFFE" }} />
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>✉️ 본문 편집</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>후기 버튼 위에 표시되는 내용을 수정하세요</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
                style={{ ...iS, resize: "vertical", lineHeight: 1.8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <div style={{ fontSize: 11, color: C.hint }}>{message.length}자</div>
                <button onClick={() => setMessage(DEFAULT_REVIEW_BODY)}
                  style={{ fontSize: 11, color: C.hint, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  기본 문구로 초기화
                </button>
              </div>
            </div>
          </div>

          {errMsg && <div style={{ padding: "11px 14px", background: "#FFF0EB", border: `1px solid #FACCB8`, borderRadius: 9, fontSize: 12, color: C.orange }}>⚠ {errMsg}</div>}
          {draftSaved && <div style={{ padding: "11px 14px", background: C.mint, border: `1px solid ${C.teal}`, borderRadius: 9, fontSize: 12, color: C.teal, fontWeight: 700 }}>✅ 임시저장 완료 — 임시저장 메일링 탭에서 확인하세요</div>}

          {result === "success" ? (
            <div style={{ padding: "16px 20px", background: C.mint, border: `1px solid ${C.teal}`, borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 4 }}>후기 요청 메일 발송 완료!</div>
              <div style={{ fontSize: 12, color: C.muted }}>{toEmail} 로 후기 요청 메일이 발송됐어요</div>
              <button onClick={resetForm} style={{ marginTop: 12, height: 36, padding: "0 20px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>새 메일 작성</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveDraft} disabled={drafting || !hospitalName || !subject}
                style={{ flex: "0 0 auto", height: 50, padding: "0 20px", background: C.surface, color: drafting ? C.hint : C.teal, border: `1.5px solid ${C.teal}`, borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: drafting || !hospitalName || !subject ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {drafting ? "저장 중..." : "💾 임시 저장"}
              </button>
              <button onClick={handleSend} disabled={sending || !toEmail || !hospitalName || !subject || !message}
                style={{ flex: 1, height: 50, background: sending ? C.hint : C.orange, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: sending || !toEmail || !hospitalName || !subject || !message ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {sending ? "발송 중..." : `📨 ${hospitalName || "고객"}에 후기 요청 메일 발송`}
              </button>
            </div>
          )}
        </div>

        {preview && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", position: "sticky", top: 0 }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📧 메일 미리보기</div>
              <div style={{ fontSize: 11, color: C.muted }}>실제 발송될 메일 디자인</div>
            </div>
            <div style={{ padding: 16, background: "#EDF5F3" }}>
              <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: C.teal, padding: "20px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 5 }}>PHOTO CLINIC · 포토클리닉</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{subject || "촬영 후기 부탁드립니다"}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{new Date().toLocaleDateString("ko-KR")}</div>
                </div>
                <div style={{ padding: "20px 24px" }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: C.txt, margin: "0 0 4px" }}>안녕하세요. 병원이야기를 전하는 포토클리닉입니다.</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.txt, margin: "0 0 12px" }}>
                    {toName || hospitalName || "원장"}님.
                  </p>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.9, margin: "0 0 16px", whiteSpace: "pre-line" }}>
                    {message}
                  </div>
                  {shootDate && (
                    <div style={{ background: C.mint, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                      <div style={{ fontSize: 11 }}><span style={{ color: C.hint, marginRight: 8, fontWeight: 700 }}>촬영일</span><span style={{ fontWeight: 700, color: C.txt }}>{shootDate}</span></div>
                    </div>
                  )}
                  <div style={{ textAlign: "center", margin: "18px 0 20px" }}>
                    <div style={{ background: C.teal, color: "#fff", display: "inline-block", padding: "10px 24px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>리뷰 작성하기</div>
                  </div>
                  <p style={{ fontSize: 11, color: C.hint, borderTop: `1px solid #EEF4F3`, paddingTop: 10, margin: "14px 0 0", lineHeight: 1.8 }}>
                    문의사항은 언제든지 연락 주세요. 감사합니다.<br/>포토클리닉 대표 정연호 드림.
                  </p>
                </div>
                <div style={{ background: C.mint, padding: "16px 20px", textAlign: "center", borderTop: `1px solid ${C.border}` }}>
                  <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" style={{ height: 24, display: "block", margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 3 }}>사진으로 병원이야기를 전합니다, 포토클리닉</div>
                  <div style={{ fontSize: 11, color: C.hint }}>PHOTO CLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 탭 5 — 셀렉 갤러리 메일 발송
// ═══════════════════════════════════════════════════════════
const SEL_STATUS_LABEL: Record<string, string> = {
  draft: "초안", uploading_images: "업로드 중", ready: "발송 준비",
  mail_draft_created: "초안 생성됨", mail_sent: "메일 발송됨",
  waiting_selection: "셀렉 대기", selection_submitted: "셀렉 완료",
  raw_matching: "RAW 매칭 중", raw_matched: "RAW 매칭 완료",
  retouching: "보정 중", completed: "완료", files_expired: "파일 만료", expired: "만료",
};
const SEL_STATUS_COLOR: Record<string, string> = {
  draft: "#9BB5B0", uploading_images: "#D97706", ready: "#2563EB",
  mail_draft_created: "#D97706", mail_sent: "#D97706",
  waiting_selection: "#2563EB", selection_submitted: "#7C3AED",
  raw_matching: "#D97706", raw_matched: "#059669",
  retouching: "#155855", completed: "#22876A", files_expired: "#9BB5B0", expired: "#DC2626",
};

function SelectGalleryMailTab() {
  const [galleries, setGalleries]   = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<any | null>(null);
  const [toEmail, setToEmail]       = useState("");
  const [toName, setToName]         = useState("");
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState<{ ok: boolean; msg: string } | null>(null);
  const [search, setSearch]         = useState("");

  useEffect(() => {
    fetch("/api/select-galleries")
      .then(r => r.json())
      .then(d => { if (d.ok) setGalleries(d.galleries); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = galleries.filter(g =>
    (g.hospital_name ?? g.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (g.shooting_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleSend = async () => {
    if (!selected || !toEmail) return;
    setSending(true); setResult(null);
    try {
      const res = await fetch(`/api/select-galleries/${selected.id}/send-mail`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_email: toEmail, to_name: toName }),
      });
      const d = await res.json();
      setResult({ ok: d.ok, msg: d.ok ? (d.message ?? "메일 초안이 메일링 큐에 저장되었습니다") : (d.error ?? "오류") });
      if (d.ok) {
        // 갤러리 상태 갱신
        setGalleries(prev => prev.map(g => g.id === selected.id ? { ...g, status: "mail_draft_created" } : g));
        setSelected((prev: any) => prev ? { ...prev, status: "mail_draft_created" } : null);
      }
    } catch (e: any) { setResult({ ok: false, msg: e.message }); }
    finally { setSending(false); }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 24, alignItems: "start" }}>

        {/* 갤러리 목록 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, flex: 1 }}>📸 셀렉 갤러리 목록</div>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="고객명·촬영명 검색" style={{ ...iS, width: 180, height: 34 }} />
            </div>
            {loading ? (
              <div style={{ padding: "32px", textAlign: "center", color: C.muted, fontSize: 13 }}>불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: C.muted, fontSize: 13 }}>셀렉 갤러리가 없습니다</div>
            ) : (
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {filtered.map(g => {
                  const isActive = selected?.id === g.id;
                  const statusColor = SEL_STATUS_COLOR[g.status] ?? "#9BB5B0";
                  const statusLabel = SEL_STATUS_LABEL[g.status] ?? g.status;
                  const expiresAt = new Date(g.file_expires_at);
                  const expired = expiresAt < new Date();
                  return (
                    <div key={g.id} onClick={() => { setSelected(g); setResult(null); if (g.to_email) setToEmail(g.to_email); }}
                      style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                        background: isActive ? C.mint : "transparent", transition: "background .1s" }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f5faf9"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.txt, flex: 1 }}>{g.hospital_name ?? g.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, background: statusColor, color: "#fff", borderRadius: 99, padding: "2px 8px" }}>{statusLabel}</span>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.muted }}>
                        <span>{g.shooting_name ?? "–"}</span>
                        <span>{g.total_jpg_count ?? 0}장</span>
                        <span style={{ color: expired ? "#DC2626" : C.muted }}>
                          {expired ? "만료" : `${expiresAt.toLocaleDateString("ko-KR")}까지`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 메일 발송 폼 */}
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, flex: 1 }}>📧 셀렉 안내 메일 발송</div>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 18, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {/* 갤러리 요약 */}
                <div style={{ background: C.mint, borderRadius: 10, padding: "12px 16px", fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: C.teal, marginBottom: 4 }}>{selected.hospital_name ?? selected.title}</div>
                  <div style={{ color: C.muted }}>{selected.shooting_name} · {selected.total_jpg_count}장 · {new Date(selected.file_expires_at).toLocaleDateString("ko-KR")}까지</div>
                  <div style={{ marginTop: 6, fontSize: 11, color: C.hint, wordBreak: "break-all" }}>
                    셀렉 링크: {baseUrl}/select/{selected.share_token}
                  </div>
                </div>

                {/* 현재 상태 안내 */}
                {["mail_draft_created","mail_sent","waiting_selection","selection_submitted"].includes(selected.status) && (
                  <div style={{ background: "#FEF9C3", border: "1px solid #FDE047", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#854D0E" }}>
                    현재 상태: <strong>{SEL_STATUS_LABEL[selected.status]}</strong> — 이미 메일이 발송된 갤러리입니다. 재발송 시 기존 초안이 덮어씌워집니다.
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>담당자명</label>
                  <input value={toName} onChange={e => setToName(e.target.value)} placeholder="원장님 / 담당자" style={iS} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>이메일 *</label>
                  <input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="example@hospital.com" style={iS} />
                </div>

                {result && (
                  <div style={{ background: result.ok ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${result.ok ? "#6EE7B7" : "#FCA5A5"}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: result.ok ? "#065F46" : "#7F1D1D" }}>
                    {result.ok ? "✅ " : "❌ "}{result.msg}
                    {result.ok && (
                      <><br /><span style={{ fontSize: 11, color: C.muted }}>임시저장 메일링 탭에서 검토 후 발송하세요.</span></>
                    )}
                  </div>
                )}

                <button onClick={handleSend} disabled={!toEmail || sending}
                  style={{ height: 44, background: toEmail ? C.teal : C.border, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: toEmail ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                  {sending ? "저장 중..." : "📬 메일 초안 메일링 큐에 저장"}
                </button>
                <div style={{ fontSize: 11, color: C.hint, textAlign: "center" }}>
                  직접 발송하지 않고 임시저장 탭에서 검토 후 발송합니다
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 메인 페이지 — 탭 전환
// ═══════════════════════════════════════════════════════════
type Tab = "queue" | "brand" | "review" | "custom" | "select";

export default function MailingPage() {
  const [tab, setTab] = useState<Tab>("custom");

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">통합 메일링</span>
          </div>
        </div>
      </header>
      <PageHeading kicker="DELIVERY MAIL" title="통합 메일링" desc="견적서·계약서·갤러리 등 메일 초안을 한 곳에서 확인하고 발송합니다." />
      <div className="pc-tabs pc-tabs--global">
        <button className={`pc-tab${tab === "custom" ? " pc-tab--active" : ""}`} onClick={() => setTab("custom")}>✉️ 브랜드 메일</button>
        <button className={`pc-tab${tab === "queue"  ? " pc-tab--active" : ""}`} onClick={() => setTab("queue")}>📥 임시저장 메일링</button>
        <button className={`pc-tab${tab === "brand"  ? " pc-tab--active" : ""}`} onClick={() => setTab("brand")}>📷 파일 전달(리뷰)</button>
        <button className={`pc-tab${tab === "review" ? " pc-tab--active" : ""}`} onClick={() => setTab("review")}>⭐ 후기 요청 메일</button>
        <button className={`pc-tab${tab === "select" ? " pc-tab--active" : ""}`} onClick={() => setTab("select")}>📸 셀렉 갤러리</button>
      </div>

      {tab === "custom" && <CustomBrandMailTab />}
      {tab === "queue"  && <QueueTab />}
      {tab === "brand"  && <BrandMailTab />}
      {tab === "review" && <ReviewOnlyMailTab />}
      {tab === "select" && <SelectGalleryMailTab />}
    </main>
  );
}
