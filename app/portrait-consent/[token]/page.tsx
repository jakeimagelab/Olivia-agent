"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useParams } from "next/navigation";
import { C, R, FS } from "@/lib/theme";
import type { PortraitConsentField } from "@/lib/portraitConsent";

// 초상권 제공자(모델/환자)가 로그인 없이 토큰 링크만으로 여는 서명 포털.
// 파일로 전달하지 않는다는 요구사항에 따라 PDF 다운로드는 제공하지 않고,
// 서명은 이 화면에서 바로 캔버스로 받아 DB(portrait_consents)에 저장한다.
interface ConsentDoc {
  id: string;
  title: string;
  intro_text: string;
  detail_fields: PortraitConsentField[];
  usage_items: PortraitConsentField[];
  consent_shoot: boolean | null;
  consent_usage: boolean | null;
  provider_name: string | null;
  signature_data_url: string | null;
  signed_date: string | null;
  status: "draft" | "sent" | "signed";
}

function YesNoToggle({
  value, onChange, disabled,
}: { value: boolean | null; onChange: (v: boolean) => void; disabled?: boolean }) {
  const btn = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    borderRadius: R.sm,
    border: `1.5px solid ${active ? C.teal : C.border}`,
    background: active ? C.teal : "#fff",
    color: active ? "#fff" : C.muted,
    fontWeight: 800,
    fontSize: FS.sm,
    cursor: disabled ? "default" : "pointer",
  });
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" disabled={disabled} onClick={() => onChange(true)} style={btn(value === true)}>예</button>
      <button type="button" disabled={disabled} onClick={() => onChange(false)} style={btn(value === false)}>아니오</button>
    </div>
  );
}

export default function PortraitConsentPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";

  const [consent, setConsent] = useState<ConsentDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [consentShoot, setConsentShoot] = useState<boolean | null>(null);
  const [consentUsage, setConsentUsage] = useState<boolean | null>(null);
  const [providerName, setProviderName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isSigningRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/portrait-consent/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((body) => {
        if (!body.ok) { setError(body.error || "링크를 열 수 없습니다."); return; }
        setConsent(body.consent);
      })
      .catch(() => setError("링크를 열 수 없습니다."))
      .finally(() => setLoading(false));
  }, [token]);

  const getSignaturePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  const startSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(event);
    if (!canvas || !point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    isSigningRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };
  const drawSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isSigningRef.current) return;
    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(event);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };
  const finishSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !isSigningRef.current) return;
    isSigningRef.current = false;
    setSignatureDataUrl(canvas.toDataURL("image/png"));
  };
  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl("");
  };

  const canSubmit = consentShoot !== null && consentUsage !== null && providerName.trim().length > 0 && signatureDataUrl.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/portrait-consent/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentShoot, consentUsage, providerName: providerName.trim(), signatureDataUrl }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || "제출에 실패했습니다.");
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff", borderRadius: R.xl, border: `1px solid ${C.border}`,
    boxShadow: "0 8px 32px rgba(21,88,85,0.08)", overflow: "hidden",
  };
  const sectionHeaderStyle = (bg: string): React.CSSProperties => ({
    background: bg, color: "#fff", fontWeight: 900, fontSize: FS.md,
    padding: "10px 20px", letterSpacing: "0.02em",
  });
  const fieldRow = (field: PortraitConsentField, i: number) => (
    <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i === -1 ? "none" : `1px dashed ${C.border}`, fontSize: FS.md }}>
      <span style={{ color: C.orange, fontWeight: 900, flexShrink: 0 }}>▷</span>
      <span style={{ fontWeight: 800, color: C.ink, minWidth: 110, flexShrink: 0 }}>{field.label}</span>
      <span style={{ color: C.muted, whiteSpace: "pre-line", flex: 1 }}>{field.value || "-"}</span>
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: C.bg, padding: "24px 16px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img src="/assets/photoclinic-logo.png" alt="포토클리닉" style={{ height: 32, objectFit: "contain" }} />
        </div>

        {loading && <p style={{ textAlign: "center", color: C.muted, fontSize: FS.sm }}>불러오는 중…</p>}
        {error && (
          <div style={{ ...cardStyle, padding: 24, textAlign: "center", color: C.danger, fontSize: FS.md, fontWeight: 700 }}>
            {error}
          </div>
        )}

        {consent && (consent.status === "signed" || submitted) && (
          <div style={cardStyle}>
            <div style={{ background: C.teal, color: "#fff", padding: "16px 20px", fontWeight: 900, fontSize: FS.lg, textAlign: "center" }}>
              서명이 정상적으로 제출되었습니다
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ fontSize: FS.xxl, fontWeight: 900, color: C.ink, textAlign: "center", marginBottom: 16 }}>{consent.title}</div>
              <p style={{ color: C.muted, fontSize: FS.md, lineHeight: 1.7, marginBottom: 20 }}>{consent.intro_text}</p>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 900, color: C.ink, fontSize: FS.sm, marginBottom: 4 }}>사진 촬영 동의: {consent.consent_shoot ? "예" : "아니오"}</div>
                <div style={{ fontWeight: 900, color: C.ink, fontSize: FS.sm }}>홍보 목적 사용 동의: {consent.consent_usage ? "예" : "아니오"}</div>
              </div>
              <div style={{ textAlign: "right", color: C.muted, fontSize: FS.sm, marginBottom: 8 }}>{consent.signed_date}</div>
              <div style={{ textAlign: "right", fontSize: FS.md, color: C.ink, marginBottom: 12 }}>
                초상권 제공자 성명 &nbsp;<b>{consent.provider_name}</b> (인)
              </div>
              {consent.signature_data_url && (
                <div style={{ textAlign: "right" }}>
                  <img src={consent.signature_data_url} alt="서명" style={{ height: 60, objectFit: "contain" }} />
                </div>
              )}
            </div>
          </div>
        )}

        {consent && consent.status !== "signed" && !submitted && (
          <div style={cardStyle}>
            <div style={{ height: 6, background: `linear-gradient(90deg, ${C.teal}, ${C.orange})` }} />
            <div style={{ padding: "28px 24px 8px" }}>
              <div style={{ fontSize: FS.xxl, fontWeight: 900, color: C.ink, textAlign: "center", marginBottom: 16 }}>{consent.title}</div>
              <p style={{ color: C.muted, fontSize: FS.md, lineHeight: 1.7, background: C.mint, borderRadius: R.md, padding: 16 }}>{consent.intro_text}</p>
            </div>

            <div style={{ padding: "0 24px", marginTop: 16 }}>
              <div style={{ ...sectionHeaderStyle(C.teal), borderRadius: R.sm }}>사진(영상)촬영</div>
              <div style={{ padding: "12px 4px" }}>{consent.detail_fields.map(fieldRow)}</div>
            </div>

            <div style={{ padding: "0 24px", marginTop: 8 }}>
              <div style={{ ...sectionHeaderStyle(C.orange), borderRadius: R.sm }}>영상/사진(이미지) 활용</div>
              <div style={{ padding: "12px 4px" }}>{consent.usage_items.map(fieldRow)}</div>
            </div>

            <div style={{ padding: "20px 24px 0", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: FS.md, color: C.ink, fontWeight: 700 }}>위와 같이 사진을 촬영하는 것에 동의합니다</span>
                <YesNoToggle value={consentShoot} onChange={setConsentShoot} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: FS.md, color: C.ink, fontWeight: 700 }}>촬영된 사진(영상)을 기업의 홍보 목적에만 사용하는 것에 동의합니다</span>
                <YesNoToggle value={consentUsage} onChange={setConsentUsage} />
              </div>
            </div>

            <div style={{ padding: "24px", marginTop: 8, borderTop: `1px solid ${C.border}` }}>
              <label style={{ display: "block", fontSize: FS.sm, fontWeight: 800, color: C.ink, marginBottom: 6 }}>초상권 제공자 성명</label>
              <input
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="이름을 입력해 주세요"
                style={{ width: "100%", padding: "10px 12px", borderRadius: R.sm, border: `1.5px solid ${C.border}`, fontSize: FS.md, boxSizing: "border-box" }}
              />

              <label style={{ display: "block", fontSize: FS.sm, fontWeight: 800, color: C.ink, margin: "18px 0 6px" }}>서명</label>
              <canvas
                ref={signatureCanvasRef}
                width={520}
                height={180}
                onPointerDown={startSignature}
                onPointerMove={drawSignature}
                onPointerUp={finishSignature}
                onPointerLeave={finishSignature}
                onPointerCancel={finishSignature}
                style={{
                  width: "100%", aspectRatio: "520 / 180", border: `1.5px dashed ${C.border}`,
                  borderRadius: R.md, background: "#fff", touchAction: "none", display: "block",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button type="button" onClick={clearSignature} style={{ fontSize: FS.xs, color: C.muted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  서명 지우기
                </button>
              </div>

              {submitError && <div style={{ color: C.danger, fontSize: FS.sm, marginTop: 12, fontWeight: 700 }}>{submitError}</div>}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                style={{
                  width: "100%", marginTop: 20, padding: "14px 0", borderRadius: R.md, border: "none",
                  background: canSubmit ? C.teal : C.hint, color: "#fff", fontWeight: 900, fontSize: FS.lg,
                  cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                }}
              >
                {submitting ? "제출 중…" : "동의하고 서명 제출"}
              </button>
            </div>

            <div style={{ textAlign: "center", padding: "16px 0 20px", color: C.hint, fontSize: FS.xs }}>포토클리닉</div>
          </div>
        )}
      </div>
    </main>
  );
}
