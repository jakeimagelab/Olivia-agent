"use client";

import { useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import {
  Q1_OPTIONS, Q2_OPTIONS, Q3_OPTIONS, Q4_OPTIONS,
  Q5_OPTIONS, Q6_OPTIONS, Q7_OPTIONS, Q8_OPTIONS,
} from "@/lib/diagnosis/questions";

const TOTAL_STEPS = 10; // 9개 질문 + 사진 업로드(9단계) + 연락처(10단계)
import { recommend } from "@/lib/diagnosis/recommendation";
import type { Answers, Concern, Content, Department, Impression, Usage, Budget, Stage, Timeline } from "@/lib/diagnosis/types";

// ── 색상 ──────────────────────────────────────────────────────
const C = {
  teal: "#155855", orange: "#E85D2C", yellow: "#EB8F22",
  sage: "#569082", bg: "#F0F9F8", white: "#ffffff",
  border: "#C8DDD9", muted: "#5A7470", light: "#EAF4F2",
};

const CONTACT_ROLES = ["원장님", "실장님", "마케팅 담당자", "대행사/협력업체", "기타"];

// ── 다중선택 토글 헬퍼 ───────────────────────────────────────
function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

// ── 옵션 버튼 ────────────────────────────────────────────────
function Opt({ label, sub, selected, onClick }: { label: string; sub?: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", padding: "13px 16px",
      borderRadius: 10, fontFamily: "inherit", cursor: "pointer",
      border: `2px solid ${selected ? C.teal : C.border}`,
      background: selected ? C.light : C.white,
      color: selected ? C.teal : "#374151",
      fontWeight: selected ? 800 : 400, fontSize: 14,
      transition: "all 120ms ease",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
          border: `2px solid ${selected ? C.teal : C.border}`,
          background: selected ? C.teal : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {selected && <span style={{ width: 7, height: 7, background: "#fff", borderRadius: "50%" }} />}
        </span>
        {label}
      </span>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, paddingLeft: 26 }}>{sub}</div>}
    </button>
  );
}

// ── 진행 바 ──────────────────────────────────────────────────
function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
        <span style={{ fontWeight: 700 }}>질문 {step} / {total}</span>
        <span>{Math.round((step / total) * 100)}%</span>
      </div>
      <div style={{ height: 5, background: C.border, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(step / total) * 100}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.sage})`, borderRadius: 99, transition: "width .3s ease" }} />
      </div>
    </div>
  );
}


export default function DiagnosisPage() {
  const [step, setStep]     = useState(1);
  const [answers, setAnswers] = useState<Partial<Answers>>({ concerns: [], usages: [], impressions: [], contents: [], consultationOptin: true });
  const [result, setResult] = useState<ReturnType<typeof recommend> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<{category: string; name: string; size: number; preview?: string}[]>([]);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, "uploading" | "done" | "error">>({});
  const [submitted, setSubmitted]   = useState(false);

  const set = useCallback((key: keyof Answers, val: any) => setAnswers(prev => ({ ...prev, [key]: val })), []);

  const PHOTO_CATEGORIES = [
    { category: "원장님 프로필사진", desc: "현재 홈페이지, 플레이스에서 사용 중인 원장님 사진" },
    { category: "진료연출장면",     desc: "진료, 상담, 시술 연출 등 신뢰감을 주는 장면" },
    { category: "병원 공간사진",    desc: "로비, 상담실, 진료실 등 병원 분위기" },
    { category: "원하는 이미지",    desc: "벤치마킹, 참고 이미지, 원하는 분위기 사진" },
  ];

  const handlePhotoChange = async (category: string, files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;

    const newPhotos = selected.map(f => ({
      category, name: f.name, size: f.size,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));

    setUploadedPhotos(prev => [...prev.filter(p => p.category !== category), ...newPhotos]);

    // Supabase Storage 업로드 (환경변수 있을 때만)
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;

    setUploadProgress(prev => ({ ...prev, [category]: "uploading" }));
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, anon);
      for (const file of selected) {
        const path = `diagnosis/${Date.now()}_${category.replace(/\s/g,"_")}_${file.name}`;
        const { error } = await sb.storage.from("uploads").upload(path, file, { upsert: true });
        if (error) throw error;
      }
      setUploadProgress(prev => ({ ...prev, [category]: "done" }));
    } catch {
      setUploadProgress(prev => ({ ...prev, [category]: "error" }));
    }
  };

  const next = () => {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else {
      const rec = recommend(answers as Answers);
      setResult(rec);
    }
  };
  const back = () => { if (step > 1) setStep(s => s - 1); };

  const submit = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, consultationOptin: true, uploadedPhotos: uploadedPhotos.map(p => ({ category: p.category, name: p.name, size: p.size })), photoUploadConsent: photoConsent }),
      });
      setSubmitted(true);
    } catch {}
    finally { setSubmitting(false); }
  };

  // ── 결과 화면 ──────────────────────────────────────────────
  if (result) {
    const PKG_COLOR: Record<string, string> = {
      Premium: C.teal, "Premium Plus": C.orange, Homepage: C.yellow, "Branding Content": C.sage,
    };

    return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <PageHeader title="병원이미지 진단" />
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 64px" }}>

          {/* 진단 결과 헤더 */}
          <div style={{ background: C.teal, borderRadius: 16, padding: "28px 28px 24px", marginBottom: 20, color: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", opacity: .7, marginBottom: 8 }}>진단 결과</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 10 }}>{result.diagnosisType}</div>
            <div style={{ fontSize: 18, fontWeight: 800, opacity: .9, marginBottom: 12 }}>{result.headline}</div>
            <div style={{ fontSize: 14, opacity: .8, lineHeight: 1.7 }}>{result.summary}</div>
          </div>



          {/* 위험 요소 */}
          {result.risks?.length > 0 && (
            <div style={{ background: "#FFF8F5", border: `1px solid #FACCB8`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.orange, marginBottom: 10 }}>⚠️ 지금 놓치고 있는 것들</div>
              {result.risks.map((r, i) => (
                <div key={i} style={{ fontSize: 13, color: "#374151", padding: "5px 0", borderBottom: i < result.risks.length-1 ? `1px solid #FEE2CC` : "none" }}>
                  · {r}
                </div>
              ))}
            </div>
          )}

          {/* 필요한 촬영 */}
          {result.neededShots?.length > 0 && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 10 }}>📷 필요한 촬영 항목</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {result.neededShots.map((s, i) => (
                  <span key={i} style={{ background: C.light, color: C.teal, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 99 }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* 패키지 추천 */}
          {result.packages?.length > 0 && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>💡 추천 패키지</div>
              {result.packages.map((pkg, i) => (
                <div key={pkg} style={{
                  borderRadius: 10, border: `2px solid ${i === 0 ? PKG_COLOR[pkg] || C.teal : C.border}`,
                  padding: "14px 16px", marginBottom: 10, background: i === 0 ? C.light : "#FAFAFA",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: PKG_COLOR[pkg] || C.teal }}>{pkg}</span>
                    {i === 0 && <span style={{ background: C.orange, color: "#fff", fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 99 }}>추천</span>}
                  </div>
                  {result.reasons?.[pkg] && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{result.reasons[pkg]}</div>}
                </div>
              ))}
            </div>
          )}

          {/* 상담 신청 */}
          {!submitted ? (
            <div style={{ background: C.teal, borderRadius: 14, padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginBottom: 6 }}>결과를 이메일로 받고 상담 신청하기</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", marginBottom: 16 }}>{answers.email || "이메일"}로 진단 결과 리포트를 보내드려요</div>
              <button onClick={submit} disabled={submitting} style={{
                height: 48, padding: "0 32px", borderRadius: 10, border: "none",
                background: C.orange, color: "#fff", fontSize: 15, fontWeight: 900,
                cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
                opacity: submitting ? 0.7 : 1,
              }}>
                {submitting ? "전송 중..." : "📩 결과 받고 상담 신청"}
              </button>
            </div>
          ) : (
            <div style={{ background: "#D1FAE5", borderRadius: 14, padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#065F46" }}>전송 완료! 곧 연락드릴게요.</div>
            </div>
          )}

          <button onClick={() => { setResult(null); setStep(1); setAnswers({ concerns: [], usages: [], impressions: [], contents: [], consultationOptin: true }); }}
            style={{ width: "100%", marginTop: 16, height: 44, borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.white, color: C.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ← 처음부터 다시
          </button>
        </div>
      </div>
    );
  }

  // ── 질문 화면 ─────────────────────────────────────────────
  const canNext = (() => {
    if (step === 1) return !!answers.stage;
    if (step === 2) return (answers.concerns?.length ?? 0) > 0;
    if (step === 3) return !!answers.department;
    if (step === 4) return (answers.usages?.length ?? 0) > 0;
    if (step === 5) return (answers.impressions?.length ?? 0) > 0;
    if (step === 6) return (answers.contents?.length ?? 0) > 0;
    if (step === 7) return !!answers.budget;
    if (step === 8) return !!answers.timeline;
    if (step === 9) return true; // 사진 업로드는 선택사항
    if (step === 10) return !!(answers.hospitalName && answers.phone && answers.email);
    return true;
  })();

  const Q_TITLES: Record<number, string> = {
    1: "현재 병원 상황이 어떻게 되시나요?",
    2: "가장 큰 고민이 무엇인가요? (복수 선택)",
    3: "진료과가 어떻게 되시나요?",
    4: "사진이 주로 어디에 쓰이나요? (복수 선택)",
    5: "원하는 병원 이미지는? (복수 선택)",
    6: "필요한 콘텐츠는? (복수 선택)",
    7: "예산 범위가 어떻게 되시나요?",
    8: "촬영 시기가 언제인가요?",
    9: "현재 사용 중인 병원 사진을 올려주세요 (선택)",
    10: "마지막으로 연락처를 입력해주세요",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <PageHeader title="병원이미지 진단" />
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "24px 20px 80px" }}>
        <ProgressBar step={step} total={TOTAL_STEPS} />

        <div style={{ background: C.white, borderRadius: 16, padding: "24px", border: `1px solid ${C.border}`, boxShadow: "0 2px 16px rgba(21,88,85,.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>
            STEP {step}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: "#1C2B28", marginBottom: 20, lineHeight: 1.4 }}>
            {Q_TITLES[step]}
          </h2>

          {/* Q1 */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Q1_OPTIONS.map(o => (
                <Opt key={o.value} label={o.label} sub={o.sub} selected={answers.stage === o.value}
                  onClick={() => set("stage", o.value as Stage)} />
              ))}
            </div>
          )}

          {/* Q2 다중 */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Q2_OPTIONS.map(o => (
                <Opt key={o.value} label={o.label} selected={(answers.concerns ?? []).includes(o.value as Concern)}
                  onClick={() => set("concerns", toggle(answers.concerns ?? [], o.value as Concern))} />
              ))}
            </div>
          )}

          {/* Q3 진료과 */}
          {step === 3 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Q3_OPTIONS.map(o => (
                <Opt key={o} label={o} selected={answers.department === o}
                  onClick={() => set("department", o as Department)} />
              ))}
            </div>
          )}

          {/* Q4 다중 */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Q4_OPTIONS.map(o => (
                <Opt key={o.value} label={o.label} selected={(answers.usages ?? []).includes(o.value as Usage)}
                  onClick={() => set("usages", toggle(answers.usages ?? [], o.value as Usage))} />
              ))}
            </div>
          )}

          {/* Q5 인상 다중 */}
          {step === 5 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Q5_OPTIONS.map(o => (
                <Opt key={o} label={o} selected={(answers.impressions ?? []).includes(o as Impression)}
                  onClick={() => set("impressions", toggle(answers.impressions ?? [], o as Impression))} />
              ))}
            </div>
          )}

          {/* Q6 콘텐츠 다중 */}
          {step === 6 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Q6_OPTIONS.map(o => (
                <Opt key={o} label={o} selected={(answers.contents ?? []).includes(o as Content)}
                  onClick={() => set("contents", toggle(answers.contents ?? [], o as Content))} />
              ))}
            </div>
          )}

          {/* Q7 예산 */}
          {step === 7 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Q7_OPTIONS.map(o => (
                <Opt key={o.value} label={o.label} selected={answers.budget === o.value}
                  onClick={() => set("budget", o.value as Budget)} />
              ))}
            </div>
          )}

          {/* Q8 일정 */}
          {step === 8 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Q8_OPTIONS.map(o => (
                <Opt key={o.value} label={o.label} selected={answers.timeline === o.value}
                  onClick={() => set("timeline", o.value as Timeline)} />
              ))}
            </div>
          )}

          {/* Q9 사진 업로드 (선택) */}
          {step === 9 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, background: C.light, borderRadius: 9, padding: "10px 14px" }}>
                현재 사용 중인 사진을 올려주시면 더 정확한 진단이 가능합니다. <strong>선택사항</strong>이므로 없으시면 바로 다음으로 이동하세요.
              </div>
              {PHOTO_CATEGORIES.map(({ category, desc }) => {
                const uploaded = uploadedPhotos.filter(p => p.category === category);
                const status   = uploadProgress[category];
                return (
                  <div key={category} style={{ border: `1.5px solid ${C.border}`, borderRadius: 11, padding: "14px 16px", background: uploaded.length ? C.light : C.white }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.teal }}>{category}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{desc}</div>
                      </div>
                      {status === "uploading" && <span style={{ fontSize: 11, color: C.yellow }}>업로드 중...</span>}
                      {status === "done"      && <span style={{ fontSize: 11, color: "#22876A" }}>✓ 완료</span>}
                      {status === "error"     && <span style={{ fontSize: 11, color: C.orange }}>오류</span>}
                    </div>
                    {uploaded.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        {uploaded.map((p, i) => (
                          p.preview
                            ? <img key={i} src={p.preview} alt={p.name} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 7, border: `1px solid ${C.border}` }} />
                            : <div key={i} style={{ padding: "4px 10px", background: "#fff", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 11, color: C.muted }}>{p.name}</div>
                        ))}
                      </div>
                    )}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${C.teal}`, color: C.teal, fontWeight: 700, fontSize: 12, cursor: "pointer", background: C.white }}>
                      + 파일 선택
                      <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handlePhotoChange(category, e.target.files)} />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {/* Q10 연락처 */}
          {step === 10 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { key: "hospitalName", label: "병원명 *", placeholder: "예: 참이지치과" },
                { key: "location",    label: "병원 위치", placeholder: "예: 서울 강남구" },
                { key: "phone",       label: "연락처 *", placeholder: "010-0000-0000" },
                { key: "email",       label: "이메일 *", placeholder: "example@hospital.com" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>{label}</div>
                  <input value={(answers as any)[key] ?? ""} onChange={e => set(key as keyof Answers, e.target.value)}
                    placeholder={placeholder}
                    style={{ width: "100%", height: 46, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>문의자 유형</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {CONTACT_ROLES.map(r => (
                    <button key={r} onClick={() => set("contactRole", r)} style={{
                      padding: "6px 14px", borderRadius: 99, border: `1.5px solid ${answers.contactRole === r ? C.teal : C.border}`,
                      background: answers.contactRole === r ? C.light : C.white, color: answers.contactRole === r ? C.teal : "#6b7280",
                      fontWeight: answers.contactRole === r ? 800 : 400, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    }}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {step > 1 && (
            <button onClick={back} style={{
              flex: 1, height: 50, borderRadius: 10, border: `1.5px solid ${C.border}`,
              background: C.white, color: C.muted, fontSize: 15, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>← 이전</button>
          )}
          <button onClick={next} disabled={!canNext} style={{
            flex: 2, height: 50, borderRadius: 10, border: "none",
            background: canNext ? C.teal : "#E5E7EB", color: canNext ? "#fff" : "#9ca3af",
            fontSize: 15, fontWeight: 900, cursor: canNext ? "pointer" : "not-allowed",
            fontFamily: "inherit", transition: "all 150ms",
          }}>
            {step === TOTAL_STEPS ? "📋 진단 완료 · 결과 보기" : "다음 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
