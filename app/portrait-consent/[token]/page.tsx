"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import PortraitConsentSignedDocument from "@/components/portrait-consent/PortraitConsentSignedDocument";
import type {
  PortraitConsentAppearanceRole,
  PortraitConsentField,
  PortraitConsentSignature,
} from "@/lib/portraitConsent";
import { generatePortraitConsentPdf } from "@/lib/portraitConsentPdf";
import styles from "./PortraitConsentPortal.module.css";

interface ConsentDoc {
  id: string;
  title: string;
  intro_text: string;
  detail_fields: PortraitConsentField[];
  usage_items: PortraitConsentField[];
  status: "draft" | "sent" | "signed";
  signature_count: number;
  signature_limit: number;
  can_sign: boolean;
}

function YesNoToggle({ value, onChange }: { value: boolean | null; onChange: (value: boolean) => void }) {
  return (
    <div className={styles.toggle}>
      <button className={value === true ? styles.toggleActive : ""} type="button" onClick={() => onChange(true)}>예</button>
      <button className={value === false ? styles.toggleActive : ""} type="button" onClick={() => onChange(false)}>아니오</button>
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
  const [providerPhone, setProviderPhone] = useState("");
  const [appearanceRole, setAppearanceRole] = useState<PortraitConsentAppearanceRole | null>(null);
  const [appearanceRoleOther, setAppearanceRoleOther] = useState("");
  const [isRealIdentity, setIsRealIdentity] = useState<boolean | null>(null);
  const [consentSensitive, setConsentSensitive] = useState<boolean | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [submittedSignature, setSubmittedSignature] = useState<PortraitConsentSignature | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isSigningRef = useRef(false);
  const docRef = useRef<HTMLDivElement>(null);

  const loadConsent = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/portrait-consent/${encodeURIComponent(token)}`);
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "링크를 열 수 없습니다.");
      setConsent(body.consent);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "링크를 열 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadConsent();
  }, [loadConsent]);

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
    const context = canvas.getContext("2d");
    if (!context) return;
    context.strokeStyle = "#111111";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const drawSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isSigningRef.current) return;
    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(event);
    if (!canvas || !point) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineTo(point.x, point.y);
    context.stroke();
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
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl("");
  };

  const canSubmit = consentShoot !== null
    && consentUsage !== null
    && providerName.trim().length > 0
    && providerPhone.trim().length > 0
    && appearanceRole !== null
    && (appearanceRole !== "other" || appearanceRoleOther.trim().length > 0)
    && isRealIdentity !== null
    && (!isRealIdentity || consentSensitive !== null)
    && signatureDataUrl.length > 0;

  const draftSignature = {
    consent_shoot: consentShoot,
    consent_usage: consentUsage,
    provider_name: providerName,
    provider_phone: providerPhone,
    appearance_role: appearanceRole,
    appearance_role_other: appearanceRole === "other" ? appearanceRoleOther : null,
    is_real_identity: isRealIdentity,
    consent_sensitive: isRealIdentity ? consentSensitive : null,
    signature_data_url: signatureDataUrl,
    signed_date: null,
  } satisfies Partial<PortraitConsentSignature>;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch(`/api/portrait-consent/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentShoot,
          consentUsage,
          providerName: providerName.trim(),
          providerPhone: providerPhone.trim(),
          appearanceRole,
          appearanceRoleOther: appearanceRole === "other" ? appearanceRoleOther.trim() : null,
          isRealIdentity,
          consentSensitive: isRealIdentity ? consentSensitive : null,
          signatureDataUrl,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "제출에 실패했습니다.");
      setSubmittedSignature(body.signature as PortraitConsentSignature);
      setConsent((current) => current ? {
        ...current,
        signature_count: body.signatureCount,
        signature_limit: body.signatureLimit,
        can_sign: body.complete !== true,
        status: body.complete ? "signed" : "sent",
      } : current);
    } catch (submitFailure) {
      setSubmitError(submitFailure instanceof Error ? submitFailure.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!docRef.current || !submittedSignature || pdfBusy) return;
    setPdfBusy(true);
    try {
      const pdf = await generatePortraitConsentPdf(docRef.current);
      pdf.save(`${consent?.title || "초상권_동의서"}_${submittedSignature.provider_name || "서명자"}.pdf`);
    } catch {
      setSubmitError("PDF 생성에 실패했습니다.");
    } finally {
      setPdfBusy(false);
    }
  };

  const startAnotherSignature = async () => {
    setSubmittedSignature(null);
    setConsentShoot(null);
    setConsentUsage(null);
    setProviderName("");
    setProviderPhone("");
    setAppearanceRole(null);
    setAppearanceRoleOther("");
    setIsRealIdentity(null);
    setConsentSensitive(null);
    setSignatureDataUrl("");
    setSubmitError("");
    await loadConsent();
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.logoWrap}>
          <img src="/assets/photoclinic-logo.png" alt="포토클리닉" />
        </div>

        {loading ? <div className={styles.message}><Loader2 className="spin-icon" size={18} /> 불러오는 중</div> : null}
        {error ? <div className={`${styles.message} ${styles.error}`}>{error}</div> : null}

        {consent && !submittedSignature && !consent.can_sign ? (
          <section className={styles.completeCard}>
            <CheckCircle2 size={34} />
            <h1>필요한 서명을 모두 받았습니다</h1>
            <p>이 링크에는 더 이상 서명할 수 없습니다. 전달한 담당자에게 문의해 주세요.</p>
            <strong>{consent.signature_count}/{consent.signature_limit}명 완료</strong>
          </section>
        ) : null}

        {consent && submittedSignature ? (
          <section className={styles.card}>
            <header className={styles.successHeader}>
              <CheckCircle2 size={22} />
              <div>
                <h1>서명이 정상적으로 제출되었습니다</h1>
                <p>{consent.signature_count}/{consent.signature_limit}명 서명 완료</p>
              </div>
            </header>
            <div className={styles.documentViewport}>
              <PortraitConsentSignedDocument ref={docRef} consent={consent} signature={submittedSignature} />
            </div>
            <footer className={styles.completionActions}>
              <button className={styles.secondaryButton} type="button" disabled={pdfBusy} onClick={() => void handleDownloadPdf()}>
                {pdfBusy ? <Loader2 className="spin-icon" size={16} /> : <Download size={16} />} PDF 다운로드
              </button>
              {consent.can_sign ? (
                <button className={styles.primaryButton} type="button" onClick={() => void startAnotherSignature()}>
                  <RotateCcw size={16} /> 다른 사람 서명하기
                </button>
              ) : null}
            </footer>
          </section>
        ) : null}

        {consent && consent.can_sign && !submittedSignature ? (
          <section className={styles.card}>
            <div className={styles.progressBar}>
              <span>서명 {consent.signature_count}/{consent.signature_limit}명</span>
              <span>{consent.signature_limit - consent.signature_count}명 남음</span>
            </div>
            <div className={styles.documentForm}>
              <div className={styles.documentViewport}>
                <PortraitConsentSignedDocument consent={consent} signature={draftSignature} />
              </div>
              <div className={styles.choiceRows}>
                <div><span>위와 같이 사진을 촬영하는 것에 동의합니다</span><YesNoToggle value={consentShoot} onChange={setConsentShoot} /></div>
                <div><span>촬영된 사진(영상)을 기업의 홍보 목적에만 사용하는 것에 동의합니다</span><YesNoToggle value={consentUsage} onChange={setConsentUsage} /></div>
              </div>
              <section className={styles.signForm}>
                <div className={styles.companySignature}>
                  <span>포토클리닉</span>
                  <img src="/assets/ceo-signature.png" alt="포토클리닉 서명" />
                </div>
                <label htmlFor="portrait-provider-name">초상권 제공자 성명</label>
                <input id="portrait-provider-name" value={providerName} placeholder="이름을 입력해 주세요" onChange={(event) => setProviderName(event.target.value)} />
                <label>서명</label>
                <div className={styles.canvasWrap}>
                  <canvas
                    ref={signatureCanvasRef}
                    width={720}
                    height={200}
                    onPointerDown={startSignature}
                    onPointerMove={drawSignature}
                    onPointerUp={finishSignature}
                    onPointerLeave={finishSignature}
                    onPointerCancel={finishSignature}
                  />
                  <button type="button" onClick={clearSignature}>서명 지우기</button>
                </div>

                <label htmlFor="portrait-provider-phone">연락처</label>
                <input
                  id="portrait-provider-phone"
                  type="tel"
                  value={providerPhone}
                  placeholder="전화번호를 입력해 주세요"
                  onChange={(event) => setProviderPhone(event.target.value)}
                />

                <fieldset className={styles.radioFieldset}>
                  <legend>출연 역할</legend>
                  <div className={styles.radioGrid}>
                    {([
                      ["patient_customer", "환자·고객"],
                      ["medical_staff", "의료진"],
                      ["staff", "직원"],
                      ["other", "기타"],
                    ] as Array<[PortraitConsentAppearanceRole, string]>).map(([value, label]) => (
                      <label className={appearanceRole === value ? styles.radioActive : ""} key={value}>
                        <input
                          type="radio"
                          name="appearance-role"
                          value={value}
                          checked={appearanceRole === value}
                          onChange={() => setAppearanceRole(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {appearanceRole === "other" ? (
                    <input
                      aria-label="기타 출연 역할"
                      value={appearanceRoleOther}
                      placeholder="출연 역할을 입력해 주세요"
                      onChange={(event) => setAppearanceRoleOther(event.target.value)}
                    />
                  ) : null}
                </fieldset>

                <fieldset className={styles.radioFieldset}>
                  <legend>실제 신분 여부</legend>
                  <div className={styles.radioGrid}>
                    <label className={isRealIdentity === true ? styles.radioActive : ""}>
                      <input
                        type="radio"
                        name="real-identity"
                        checked={isRealIdentity === true}
                        onChange={() => setIsRealIdentity(true)}
                      />
                      실제 본인 신분
                    </label>
                    <label className={isRealIdentity === false ? styles.radioActive : ""}>
                      <input
                        type="radio"
                        name="real-identity"
                        checked={isRealIdentity === false}
                        onChange={() => {
                          setIsRealIdentity(false);
                          setConsentSensitive(null);
                        }}
                      />
                      역할 출연(연기)
                    </label>
                  </div>
                </fieldset>

                {isRealIdentity ? (
                  <fieldset className={styles.radioFieldset}>
                    <legend>민감정보 동의</legend>
                    <div className={styles.radioGrid}>
                      <label className={consentSensitive === true ? styles.radioActive : ""}>
                        <input
                          type="radio"
                          name="sensitive-consent"
                          checked={consentSensitive === true}
                          onChange={() => setConsentSensitive(true)}
                        />
                        동의
                      </label>
                      <label className={consentSensitive === false ? styles.radioActive : ""}>
                        <input
                          type="radio"
                          name="sensitive-consent"
                          checked={consentSensitive === false}
                          onChange={() => setConsentSensitive(false)}
                        />
                        미동의
                      </label>
                    </div>
                  </fieldset>
                ) : null}
                {submitError ? <div className={styles.formError}>{submitError}</div> : null}
              </section>
            </div>
            <footer className={styles.submitBar}>
              <span>본인의 이름과 서명을 확인한 뒤 제출해 주세요.</span>
              <button className={styles.primaryButton} type="button" disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
                {submitting ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                {submitting ? "제출 중" : "동의하고 서명 제출"}
              </button>
            </footer>
          </section>
        ) : null}
      </div>
    </main>
  );
}
