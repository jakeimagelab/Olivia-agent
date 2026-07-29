"use client";

import { useEffect, useRef, useState } from "react";
import { C, R, FS } from "@/lib/theme";
import type {
  ChannelScores, DiagnosisChannel, HistoryItem, HospitalBrandDiagnosisReport, SourceStatus,
} from "@/lib/hospitalBrandDiagnosis/types";
import { HBD_CHANNEL_LABEL } from "@/lib/hospitalBrandDiagnosis/config";

const inputStyle: React.CSSProperties = {
  height: 40, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 12px", fontSize: FS.md, width: "100%", fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = { fontSize: FS.sm, fontWeight: 800, color: C.muted };
const cardStyle: React.CSSProperties = { background: C.white, borderRadius: R.lg, border: `1px solid ${C.border}`, padding: 22 };
const primaryBtn: React.CSSProperties = {
  height: 44, padding: "0 22px", borderRadius: R.md, border: "none", background: C.teal, color: "#fff",
  fontWeight: 800, fontSize: FS.md, cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  height: 44, padding: "0 22px", borderRadius: R.md, border: `1px solid ${C.border}`, background: C.white, color: C.muted,
  fontWeight: 800, fontSize: FS.md, cursor: "pointer",
};

/* ─────────────────────────── STEP 7: 결과 리포트 ─────────────────────────── */

const SCORE_LABEL: Record<keyof ChannelScores, string> = {
  informationClarity: "정보 전달력", visualUtilization: "비주얼 활용도", brandConsistency: "브랜드 일관성",
  channelSuitability: "채널 적합성", technicalReadiness: "기술 준비도",
};

const ANALYSIS_METHOD_LABEL: Record<SourceStatus, string> = {
  pending: "확인 불가", collecting: "확인 불가", complete: "정밀 분석",
  partial: "부분 분석", failed: "확인 불가", manual_required: "업로드 자료 기반 분석",
};
const ANALYSIS_METHOD_DESC: Record<SourceStatus, string> = {
  pending: "이 채널은 아직 자료를 수집하지 않았습니다.",
  collecting: "이 채널은 아직 자료를 수집하지 않았습니다.",
  complete: "페이지 본문, 제목, 이미지, ALT 텍스트 및 구조 정보를 확인했습니다.",
  partial: "자동 수집된 정보가 제한적이라 일부만 확인했습니다.",
  failed: "자동 수집과 업로드 자료가 모두 없어 분석하지 못했습니다.",
  manual_required: "자동 수집이 제한되어 업로드한 화면·이미지를 기준으로 분석했습니다.",
};
const ANALYSIS_METHOD_COLOR: Record<SourceStatus, string> = {
  pending: C.hint, collecting: C.hint, complete: C.success, partial: C.gold, failed: C.hint, manual_required: C.orange,
};

const CONFIDENCE_LABEL: Record<string, string> = { high: "신뢰도 높음", medium: "신뢰도 보통", low: "제한된 자료 기반" };
const CONFIDENCE_COLOR: Record<string, string> = { high: C.success, medium: C.gold, low: C.hint };
const SOURCE_TYPE_LABEL: Record<string, string> = {
  html: "페이지 HTML", api: "API 데이터", browser: "브라우저 수집", screenshot: "화면 캡처",
  uploaded_image: "업로드 이미지", uploaded_video: "업로드 영상",
};

function EvidencePanel({ channel, evidence, diagnosisId, onClose }: {
  channel: DiagnosisChannel; evidence: import("@/lib/hospitalBrandDiagnosis/types").EvidenceItem[];
  diagnosisId: string | null; onClose: () => void;
}) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!diagnosisId) return;
    const imageIds = evidence
      .filter((e) => (e.sourceType === "uploaded_image" || e.sourceType === "screenshot") && e.sourceId)
      .map((e) => e.sourceId!);
    if (imageIds.length === 0) return;
    fetch("/api/hospital-brand-diagnosis/asset-url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnosisId, assetIds: imageIds }),
    })
      .then((r) => r.json())
      .then((body) => { if (body.ok) setSignedUrls(body.urls || {}); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisId, channel]);

  return (
    <div className="hbd-print-hide" style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(13,37,35,.5)", padding: 20 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "min(640px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", borderRadius: R.lg, background: C.white, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: FS.lg, fontWeight: 900, color: C.ink }}>{HBD_CHANNEL_LABEL[channel]} — 근거 자료</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: R.sm, background: "#fff", color: C.muted, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        {evidence.length === 0 ? (
          <p style={{ color: C.muted, fontSize: FS.sm }}>이 채널에 연결된 근거 자료가 없습니다.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {evidence.map((e) => (
              <div key={e.id} style={{ border: `1px solid ${C.border}`, borderRadius: R.md, padding: 12, display: "grid", gap: 8 }}>
                <p style={{ margin: 0, fontSize: FS.sm, color: C.ink, lineHeight: 1.6 }}>{e.statement}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: FS.xs, fontWeight: 800, color: "#fff", background: C.teal, borderRadius: R.full, padding: "2px 9px" }}>
                    {SOURCE_TYPE_LABEL[e.sourceType] || e.sourceType}
                  </span>
                  <span style={{ fontSize: FS.xs, fontWeight: 800, color: "#fff", background: CONFIDENCE_COLOR[e.confidence], borderRadius: R.full, padding: "2px 9px" }}>
                    {CONFIDENCE_LABEL[e.confidence] || e.confidence}
                  </span>
                  {e.reference && (
                    <a href={e.reference} target="_blank" rel="noreferrer" style={{ fontSize: FS.xs, color: C.teal, fontWeight: 700, wordBreak: "break-all" }}>
                      {e.reference}
                    </a>
                  )}
                </div>
                {e.sourceId && signedUrls[e.sourceId] && (
                  <img src={signedUrls[e.sourceId]} alt="근거 이미지" style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain", borderRadius: R.sm, border: `1px solid ${C.border}` }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="hbd-print-hide" style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(13,37,35,.5)", padding: 20 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "min(480px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", borderRadius: R.lg, background: C.white, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: FS.lg, fontWeight: 900, color: C.ink }}>{title}</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: R.sm, background: "#fff", color: C.muted, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmailModal({ diagnosisId, onClose }: { diagnosisId: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim()) { setError("이메일을 입력해주세요."); return; }
    setSending(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}/email`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toEmail: email.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "이메일 준비에 실패했습니다.");
      setMessage("메일링함에 발송 초안이 저장되었습니다. 메일링 페이지에서 최종 발송해주세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이메일 준비에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell title="이메일로 받기" onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={labelStyle}>받는 사람 이메일</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@hospital.com" style={inputStyle} />
        </label>
        {error && <p style={{ margin: 0, color: C.danger, fontSize: FS.xs }}>{error}</p>}
        {message && <p style={{ margin: 0, color: C.success, fontSize: FS.xs }}>{message}</p>}
        <button onClick={submit} disabled={sending} style={{ ...primaryBtn, opacity: sending ? 0.6 : 1 }}>{sending ? "준비 중…" : "발송 초안 만들기"}</button>
      </div>
    </ModalShell>
  );
}

type ShareRow = {
  id: string; recipient_email: string; recipient_memo: string; expires_at: string;
  revoked_at: string | null; last_accessed_at: string | null; access_count: number; created_at: string;
};

function ShareModal({ diagnosisId, onClose }: { diagnosisId: string; onClose: () => void }) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientMemo, setRecipientMemo] = useState("");
  const [newLink, setNewLink] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`/api/hospital-brand-diagnosis/${diagnosisId}/shares`)
      .then((r) => r.json())
      .then((body) => { if (body.ok) setShares(body.shares || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createShare = async () => {
    setCreating(true); setError(""); setNewLink("");
    try {
      const res = await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}/shares`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: recipientEmail.trim(), recipientMemo: recipientMemo.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "공유 링크 생성에 실패했습니다.");
      const link = `${window.location.origin}/hospital-brand-image-diagnosis/shared/${body.token}`;
      setNewLink(link);
      setRecipientEmail(""); setRecipientMemo("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "공유 링크 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (shareId: string) => {
    await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}/shares/${shareId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke" }),
    }).catch(() => {});
    load();
  };

  return (
    <ModalShell title="팀원에게 공유" onClose={onClose}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>받는 사람 이메일 (선택)</span>
            <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="name@example.com" style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>메모 (선택)</span>
            <input value={recipientMemo} onChange={(e) => setRecipientMemo(e.target.value)} placeholder="예: 병원 마케팅 담당자" style={inputStyle} />
          </label>
          {error && <p style={{ margin: 0, color: C.danger, fontSize: FS.xs }}>{error}</p>}
          {newLink && (
            <div style={{ background: C.mint, borderRadius: R.sm, padding: 10, display: "grid", gap: 6 }}>
              <span style={{ fontSize: FS.xs, color: C.teal, fontWeight: 800 }}>링크가 생성되었습니다 (다시 확인할 수 없으니 지금 복사해주세요)</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input readOnly value={newLink} style={{ ...inputStyle, height: 34, fontSize: FS.xs }} onFocus={(e) => e.target.select()} />
                <button onClick={() => navigator.clipboard?.writeText(newLink)} style={{ ...secondaryBtn, height: 34, padding: "0 12px", fontSize: FS.xs }}>복사</button>
              </div>
            </div>
          )}
          <button onClick={createShare} disabled={creating} style={{ ...primaryBtn, opacity: creating ? 0.6 : 1 }}>{creating ? "생성 중…" : "보기 전용 링크 생성 (14일 유효)"}</button>
        </div>

        <div>
          <span style={{ ...labelStyle, display: "block", marginBottom: 8 }}>생성된 공유 링크</span>
          {loading ? (
            <p style={{ fontSize: FS.xs, color: C.muted }}>불러오는 중…</p>
          ) : shares.length === 0 ? (
            <p style={{ fontSize: FS.xs, color: C.muted }}>아직 생성된 공유 링크가 없습니다.</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {shares.map((s) => {
                const expired = new Date(s.expires_at) < new Date();
                const inactive = !!s.revoked_at || expired;
                return (
                  <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: R.sm, padding: 8, display: "flex", alignItems: "center", gap: 8, opacity: inactive ? 0.55 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: FS.xs, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.recipient_email || s.recipient_memo || "(받는 사람 미지정)"}
                      </div>
                      <div style={{ fontSize: 10, color: C.hint }}>
                        {s.revoked_at ? "취소됨" : expired ? "만료됨" : `만료 ${new Date(s.expires_at).toLocaleDateString("ko-KR")}`}
                        {s.access_count > 0 ? ` · 조회 ${s.access_count}회` : ""}
                      </div>
                    </div>
                    {!inactive && (
                      <button onClick={() => revoke(s.id)} style={{ ...secondaryBtn, height: 28, padding: "0 10px", fontSize: 10 }}>취소</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

export function ReportView({ report, onRestart, onBackToStep, diagnosisId, readOnly }: {
  report: HospitalBrandDiagnosisReport; onRestart: () => void; onBackToStep: (n: number) => void; diagnosisId: string | null;
  readOnly?: boolean;
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfSuccess, setPdfSuccess] = useState(false);
  const [evidenceChannel, setEvidenceChannel] = useState<DiagnosisChannel | null>(null);
  const [actions, setActions] = useState<DiagnosisAction[]>([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareCandidates, setCompareCandidates] = useState<HistoryItem[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareReport, setCompareReport] = useState<HospitalBrandDiagnosisReport | null>(null);
  const [compareError, setCompareError] = useState("");

  // 즉시 수정 항목의 진행 상태(섹션 15-2) — 최초 진입 시 없으면 리포트의 즉시수정항목으로 1회 시딩한다.
  // 보기 전용 공유 화면(readOnly)에서는 조회도, 시딩도 하지 않는다 — 외부 뷰어는 수정 권한이 없다.
  useEffect(() => {
    if (!diagnosisId || readOnly) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}/actions`);
        const body = await res.json();
        if (!res.ok || !body.ok) return;
        let list: any[] = body.actions || [];
        if (list.length === 0) {
          const seedItems = [
            ...report.immediateActions.map((title) => ({ channel: null, title })),
            ...report.channelResults.flatMap((r) => r.immediateActions.map((title) => ({ channel: r.channel, title }))),
          ];
          if (seedItems.length > 0) {
            const seedRes = await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}/actions`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: seedItems }),
            });
            const seedBody = await seedRes.json();
            if (seedRes.ok && seedBody.ok) list = seedBody.actions || [];
          }
        }
        if (!cancelled) {
          setActions(list.map((a: any) => ({
            id: a.id, diagnosisId: a.diagnosis_id, channel: a.channel, title: a.title, description: a.description || "",
            priority: a.priority, status: a.status, createdAt: a.created_at, completedAt: a.completed_at,
          })));
        }
      } catch {
        // 개선 항목 목록은 부가 기능이므로 실패해도 리포트 조회 자체는 막지 않는다.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisId]);

  const updateActionStatus = async (actionId: string, status: ActionStatus) => {
    setActions((prev) => prev.map((a) => (a.id === actionId ? { ...a, status } : a)));
    if (!diagnosisId) return;
    await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}/actions/${actionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).catch(() => {});
  };

  const openCompare = async () => {
    setShowCompare(true);
    setCompareReport(null);
    setCompareError("");
    setCompareLoading(true);
    try {
      const res = await fetch("/api/hospital-brand-diagnosis/create?limit=50");
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "이전 진단 목록을 불러오지 못했습니다.");
      const candidates: HistoryItem[] = (body.diagnoses || []).filter((d: HistoryItem) =>
        d.id !== report.id && d.status === "completed" &&
        d.hospital_name === report.profile.hospitalName && d.specialty === report.profile.specialty
      );
      setCompareCandidates(candidates);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : "이전 진단 목록을 불러오지 못했습니다.");
    } finally {
      setCompareLoading(false);
    }
  };

  const pickCompareCandidate = async (id: string) => {
    setCompareLoading(true);
    setCompareError("");
    try {
      const res = await fetch(`/api/hospital-brand-diagnosis/${id}`);
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "이전 진단을 불러오지 못했습니다.");
      if (!body.diagnosis?.report_json) throw new Error("선택한 진단에는 완료된 리포트가 없습니다.");
      setCompareReport(body.diagnosis.report_json as HospitalBrandDiagnosisReport);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : "이전 진단을 불러오지 못했습니다.");
    } finally {
      setCompareLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!reportRef.current || downloading) return;
    setDownloading(true);
    setPdfError("");
    setPdfSuccess(false);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = 210, pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight, position = 0;
      const image = canvas.toDataURL("image/png");
      pdf.addImage(image, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(image, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`${report.profile.hospitalName || "병원"}_브랜드이미지진단_${new Date().toISOString().slice(0, 10)}.pdf`);
      setPdfSuccess(true);
      window.setTimeout(() => setPdfSuccess(false), 3000);
    } catch (error) {
      console.error("[HospitalBrandDiagnosis] PDF generation failed", error);
      setPdfError("PDF 생성에 실패했습니다. 잠시 후 다시 시도하거나 브라우저 인쇄 기능을 사용해 주세요.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {readOnly && (
        <div className="hbd-print-hide" style={{ background: C.mint, borderRadius: R.md, padding: 12, fontSize: FS.xs, color: C.teal, fontWeight: 700 }}>
          공유된 리포트를 보기 전용으로 열람 중입니다. 수정하거나 다시 진단할 수 없습니다.
        </div>
      )}
      <div className="hbd-print-hide" style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={downloadPdf} disabled={downloading} style={{ ...secondaryBtn, opacity: downloading ? 0.6 : 1 }}>{downloading ? "PDF 생성 중…" : "PDF 다운로드"}</button>
        <button onClick={() => window.print()} style={secondaryBtn}>브라우저 인쇄로 저장</button>
        {!readOnly && <button onClick={openCompare} style={secondaryBtn}>이전 진단과 비교</button>}
        {!readOnly && diagnosisId && <button onClick={() => setShowEmailModal(true)} style={secondaryBtn}>이메일로 받기</button>}
        {!readOnly && diagnosisId && <button onClick={() => setShowShareModal(true)} style={secondaryBtn}>팀원에게 공유</button>}
        {!readOnly && <button onClick={() => onBackToStep(4)} style={secondaryBtn}>분석 자료 다시 확인</button>}
        {!readOnly && <button onClick={() => onBackToStep(3)} style={secondaryBtn}>다른 채널 추가 분석</button>}
        {!readOnly && <button onClick={onRestart} style={primaryBtn}>재진단 시작</button>}
      </div>

      {pdfError && (
        <div className="hbd-print-hide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#FFF0F0", border: `1px solid ${C.danger}`, borderRadius: R.md, padding: 12 }}>
          <span style={{ color: C.danger, fontSize: FS.sm }}>{pdfError}</span>
          <button onClick={downloadPdf} style={{ ...secondaryBtn, height: 34, padding: "0 14px", fontSize: FS.xs, flexShrink: 0 }}>다시 시도</button>
        </div>
      )}
      {pdfSuccess && (
        <div className="hbd-print-hide" style={{ background: C.mint, border: `1px solid ${C.success}`, borderRadius: R.md, padding: 12, color: C.success, fontSize: FS.sm, fontWeight: 700 }}>
          PDF 리포트가 생성되었습니다.
        </div>
      )}

      <div ref={reportRef} className="hbd-print-area" style={{ background: C.white, padding: 8, display: "grid", gap: 22 }}>
        {/* 1. 종합 요약 */}
        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 10px", fontSize: FS.xl, fontWeight: 900, color: C.ink }}>{report.profile.hospitalName} 브랜드이미지 진단 결과</h2>
          <p style={{ margin: 0, fontSize: FS.md, color: C.ink, lineHeight: 1.7 }}>{report.overallSummary}</p>
        </section>

        {/* 2. 의도 vs 실제 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>병원이 의도한 이미지와 실제 이미지</h3>
          <div className="hbd-two-col-grid">
            <div>
              <div style={{ fontSize: FS.xs, fontWeight: 800, color: C.teal, marginBottom: 6 }}>의도한 이미지</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.7 }}>
                {report.crossChannel.desiredVsActual.desiredImage.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: FS.xs, fontWeight: 800, color: C.orange, marginBottom: 6 }}>실제 전달 이미지</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.7 }}>
                {report.crossChannel.desiredVsActual.actualImage.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
          {report.crossChannel.desiredVsActual.gaps.length > 0 && (
            <div style={{ marginTop: 12, background: C.bg, borderRadius: R.sm, padding: 10 }}>
              <div style={{ fontSize: FS.xs, fontWeight: 800, color: C.muted, marginBottom: 4 }}>차이가 있는 요소</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.6 }}>
                {report.crossChannel.desiredVsActual.gaps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </section>

        {/* 3. 채널별 점수 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 6px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>채널별 점수</h3>
          <p style={{ margin: "0 0 12px", fontSize: FS.xs, color: C.muted }}>점수는 절대 평가나 경쟁 병원 순위가 아니며, 동일 병원의 개선 전후를 비교하기 위한 내부 지표입니다.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, minWidth: 480 }}>
              <thead>
                <tr style={{ background: C.bg, color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: "8px 10px" }}>채널</th>
                  {(Object.keys(SCORE_LABEL) as (keyof ChannelScores)[]).map((k) => (
                    <th key={k} style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{SCORE_LABEL[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.channelResults.map((r) => (
                  <tr key={r.channel} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 10px", fontWeight: 800, color: C.ink }}>{HBD_CHANNEL_LABEL[r.channel]}</td>
                    {(Object.keys(SCORE_LABEL) as (keyof ChannelScores)[]).map((k) => (
                      <td key={k} style={{ padding: "8px 10px", color: C.ink }}>
                        {(r.scores as any)?.[k]?.value ?? <span style={{ color: C.hint }}>확인 불가</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. 잘하고 있는 점 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.success }}>잘하고 있는 점</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.8 }}>
            {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>

        {/* 5. 현재 놓치고 있는 정보 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>현재 놓치고 있는 정보</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.8 }}>
            {report.missingInformation.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>

        {/* 6. 바로 수정할 수 있는 항목 */}
        <section style={cardStyle} className="hbd-actions-section">
          <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.orange }}>바로 수정할 수 있는 항목</h3>
          {actions.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {actions.map((a) => (
                <div key={a.id} className="hbd-action-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ flex: 1, fontSize: FS.sm, color: a.status === "completed" ? C.hint : C.ink, textDecoration: a.status === "completed" ? "line-through" : "none" }}>
                    {a.channel ? `[${HBD_CHANNEL_LABEL[a.channel]}] ` : ""}{a.title}
                  </span>
                  <select
                    className="hbd-print-hide"
                    value={a.status}
                    onChange={(e) => updateActionStatus(a.id, e.target.value as ActionStatus)}
                    style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, fontSize: FS.xs, color: C.ink, flexShrink: 0 }}
                  >
                    <option value="todo">미완료</option>
                    <option value="in_progress">진행 중</option>
                    <option value="completed">완료</option>
                    <option value="deferred">보류</option>
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.8 }}>
              {report.immediateActions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </section>

        {/* 7. 콘텐츠 재활용 지도 */}
        {report.reuseMap.length > 0 && (
          <section style={cardStyle}>
            <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>콘텐츠 재활용 지도</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {report.reuseMap.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: FS.sm, background: C.bg, borderRadius: R.sm, padding: 10 }}>
                  <span style={{ fontWeight: 800, color: C.ink }}>{item.assetDescription}</span>
                  <span style={{ color: C.hint }}>→</span>
                  <span style={{ color: C.teal, fontWeight: 700 }}>{item.recommendedChannels.map((c) => HBD_CHANNEL_LABEL[c]).join(", ")}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 8. 채널별 상세 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>채널별 상세 결과</h3>
          <div style={{ display: "grid", gap: 14 }}>
            {report.channelResults.map((r) => {
              const source = report.sources.find((s) => s.channel === r.channel);
              const methodStatus = source?.status ?? "failed";
              return (
              <div key={r.channel} style={{ border: `1px solid ${C.border}`, borderRadius: R.md, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: FS.md, color: C.ink }}>{HBD_CHANNEL_LABEL[r.channel]}</strong>
                  <span
                    title={ANALYSIS_METHOD_DESC[methodStatus]}
                    style={{
                      fontSize: FS.xs, fontWeight: 800, color: "#fff", background: ANALYSIS_METHOD_COLOR[methodStatus],
                      borderRadius: R.full, padding: "2px 9px", cursor: "help",
                    }}
                  >{ANALYSIS_METHOD_LABEL[methodStatus]}</span>
                  <button
                    onClick={() => setEvidenceChannel(r.channel)}
                    style={{ marginLeft: "auto", height: 26, padding: "0 10px", borderRadius: R.full, border: `1px solid ${C.border}`, background: "#fff", color: C.teal, fontSize: FS.xs, fontWeight: 800, cursor: "pointer" }}
                  >근거 보기</button>
                </div>
                <p style={{ margin: "6px 0 10px", fontSize: FS.sm, color: C.ink, lineHeight: 1.6 }}>{r.summary}</p>
                {r.strengths.length > 0 && <p style={{ margin: "4px 0", fontSize: FS.xs, color: C.success }}>강점: {r.strengths.join(" · ")}</p>}
                {r.missingInformation.length > 0 && <p style={{ margin: "4px 0", fontSize: FS.xs, color: C.muted }}>부족한 정보: {r.missingInformation.join(" · ")}</p>}
                {r.immediateActions.length > 0 && <p style={{ margin: "4px 0", fontSize: FS.xs, color: C.orange }}>즉시 수정: {r.immediateActions.join(" · ")}</p>}
                {r.unavailableChecks.length > 0 && <p style={{ margin: "4px 0", fontSize: FS.xs, color: C.hint }}>확인 불가: {r.unavailableChecks.join(" · ")}</p>}
              </div>
              );
            })}
          </div>
        </section>

        {/* 9. 분석 범위와 한계 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.muted }}>분석 범위와 한계</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.xs, color: C.muted, lineHeight: 1.8 }}>
            {report.limitations.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      </div>

      {evidenceChannel && (
        <EvidencePanel
          channel={evidenceChannel}
          evidence={report.evidence.filter((e) => e.channel === evidenceChannel)}
          diagnosisId={diagnosisId}
          onClose={() => setEvidenceChannel(null)}
        />
      )}

      {showEmailModal && diagnosisId && <EmailModal diagnosisId={diagnosisId} onClose={() => setShowEmailModal(false)} />}
      {showShareModal && diagnosisId && <ShareModal diagnosisId={diagnosisId} onClose={() => setShowShareModal(false)} />}

      {showCompare && (
        <div className="hbd-print-hide" style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(13,37,35,.5)", padding: 20 }}
          onMouseDown={(e) => e.target === e.currentTarget && setShowCompare(false)}>
          <div style={{ width: "min(720px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", borderRadius: R.lg, background: C.white, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: FS.lg, fontWeight: 900, color: C.ink }}>이전 진단과 비교</h3>
              <button onClick={() => setShowCompare(false)} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: R.sm, background: "#fff", color: C.muted, fontSize: 18, cursor: "pointer" }}>×</button>
            </div>

            {compareError && <p style={{ color: C.danger, fontSize: FS.sm }}>{compareError}</p>}
            {compareLoading && <p style={{ color: C.muted, fontSize: FS.sm }}>불러오는 중…</p>}

            {!compareLoading && !compareReport && !compareError && (
              compareCandidates.length === 0 ? (
                <p style={{ color: C.muted, fontSize: FS.sm }}>같은 병원·진료과로 완료된 이전 진단이 없습니다.</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {compareCandidates.map((c) => (
                    <button key={c.id} onClick={() => pickCompareCandidate(c.id)} style={{ textAlign: "left", padding: 12, border: `1px solid ${C.border}`, borderRadius: R.sm, background: "#fff", cursor: "pointer" }}>
                      <strong style={{ fontSize: FS.sm, color: C.ink }}>{new Date(c.updated_at).toLocaleDateString("ko-KR")} 진단</strong>
                    </button>
                  ))}
                </div>
              )
            )}

            {compareReport && (() => {
              const oldChannels = new Set(compareReport.channelResults.map((r) => r.channel));
              const newChannels = new Set(report.channelResults.map((r) => r.channel));
              const removedChannels = [...oldChannels].filter((c) => !newChannels.has(c));
              const scopeDiffers = [...newChannels].some((c) => !oldChannels.has(c)) || removedChannels.length > 0;

              const oldMissing = new Set(compareReport.missingInformation);
              const newMissing = new Set(report.missingInformation);
              const resolved = [...oldMissing].filter((x) => !newMissing.has(x));
              const newlyFound = [...newMissing].filter((x) => !oldMissing.has(x));
              const unresolved = [...oldMissing].filter((x) => newMissing.has(x));

              return (
                <div style={{ display: "grid", gap: 16 }}>
                  {scopeDiffers && (
                    <p style={{ margin: 0, fontSize: FS.xs, color: C.orange, background: "#FFF7EC", padding: 10, borderRadius: R.sm }}>
                      이전 진단과 현재 진단의 분석 자료 범위가 달라 점수를 직접 비교할 때 주의가 필요합니다.
                    </p>
                  )}

                  <div>
                    <h4 style={{ fontSize: FS.sm, fontWeight: 900, color: C.ink, margin: "0 0 8px" }}>채널별 점수 비교</h4>
                    <div style={{ display: "grid", gap: 8 }}>
                      {report.channelResults.map((r) => {
                        const old = compareReport.channelResults.find((o) => o.channel === r.channel);
                        if (!old) return (
                          <div key={r.channel} style={{ fontSize: FS.xs, color: C.teal, fontWeight: 700 }}>· {HBD_CHANNEL_LABEL[r.channel]}: 새로 추가된 채널</div>
                        );
                        return (
                          <div key={r.channel} style={{ border: `1px solid ${C.border}`, borderRadius: R.sm, padding: 10 }}>
                            <strong style={{ fontSize: FS.sm, color: C.ink }}>{HBD_CHANNEL_LABEL[r.channel]}</strong>
                            <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                              {(Object.keys(SCORE_LABEL) as (keyof ChannelScores)[]).map((k) => {
                                const oldVal = (old.scores as any)?.[k]?.value;
                                const newVal = (r.scores as any)?.[k]?.value;
                                if (oldVal == null && newVal == null) return null;
                                const diff = (oldVal != null && newVal != null) ? newVal - oldVal : null;
                                return (
                                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: FS.xs, color: C.muted }}>
                                    <span>{SCORE_LABEL[k]}</span>
                                    <span>
                                      {oldVal ?? "확인 불가"} → {newVal ?? "확인 불가"}
                                      {diff != null && <b style={{ marginLeft: 6, color: diff > 0 ? C.success : diff < 0 ? C.danger : C.hint }}>{diff > 0 ? `+${diff}` : diff}</b>}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {removedChannels.map((ch) => (
                        <div key={ch} style={{ fontSize: FS.xs, color: C.hint }}>· {HBD_CHANNEL_LABEL[ch]}: 이번 진단에서 제외된 채널</div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 style={{ fontSize: FS.sm, fontWeight: 900, color: C.ink, margin: "0 0 8px" }}>변화 요약</h4>
                    <div style={{ display: "grid", gap: 10 }}>
                      {resolved.length > 0 && (
                        <div>
                          <b style={{ fontSize: FS.xs, color: C.success }}>개선된 항목</b>
                          <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: FS.xs, color: C.ink, lineHeight: 1.7 }}>{resolved.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                      {newlyFound.length > 0 && (
                        <div>
                          <b style={{ fontSize: FS.xs, color: C.orange }}>새롭게 발견된 문제</b>
                          <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: FS.xs, color: C.ink, lineHeight: 1.7 }}>{newlyFound.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                      {unresolved.length > 0 && (
                        <div>
                          <b style={{ fontSize: FS.xs, color: C.hint }}>해결되지 않은 항목</b>
                          <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: FS.xs, color: C.ink, lineHeight: 1.7 }}>{unresolved.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                      {resolved.length === 0 && newlyFound.length === 0 && unresolved.length === 0 && (
                        <p style={{ margin: 0, fontSize: FS.xs, color: C.muted }}>비교할 변화 항목이 없습니다.</p>
                      )}
                    </div>
                  </div>

                  <button onClick={() => setCompareReport(null)} style={{ ...secondaryBtn, height: 36, fontSize: FS.xs, width: "fit-content" }}>다른 진단 선택</button>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
