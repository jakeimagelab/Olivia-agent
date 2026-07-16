"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#F0F9F8",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", green: "#22876A",
  purple: "#7C3AED",
};

type ClientForm = {
  name: string; director_name: string; department: string;
  main_treatments: string; doctor_count: string;
  website_url: string; instagram_url: string; special_notes: string;
};

const EMPTY: ClientForm = {
  name: "", director_name: "", department: "", main_treatments: "",
  doctor_count: "", website_url: "", instagram_url: "", special_notes: "",
};

function ConsultationInner() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id");
  const router = useRouter();

  const [form, setForm] = useState<ClientForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(clientId);

  const [memo, setMemo] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);
  const [analyzeErr, setAnalyzeErr] = useState("");

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`).then(r => r.json()).then(d => {
      if (d.ok && d.client) {
        const c = d.client;
        setForm({
          name: c.name || "", director_name: c.director_name || "",
          department: c.department || "", main_treatments: c.main_treatments || "",
          doctor_count: c.doctor_count ? String(c.doctor_count) : "",
          website_url: c.website_url || "", instagram_url: c.instagram_url || "",
          special_notes: c.special_notes || "",
        });
      }
    });
  }, [clientId]);

  const set = (k: keyof ClientForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const saveClient = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true); setSaveMsg(null);
    try {
      const payload = { ...form, doctor_count: form.doctor_count ? parseInt(form.doctor_count) : null };
      let res;
      if (savedId) {
        res = await fetch(`/api/clients/${savedId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/clients", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, memo: memo.trim() || null }),
        });
      }
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "저장 실패");
      if (!savedId && d.id) setSavedId(d.id);
      setSaveMsg({ text: savedId ? "정보가 업데이트됐습니다." : "고객이 등록됐습니다. 워크플로우 1단계가 시작됩니다.", ok: true });
    } catch (e: any) {
      setSaveMsg({ text: e.message || "저장 중 오류", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const analyze = async () => {
    if (!memo.trim()) return;
    setAnalyzing(true); setAnalyzeErr(""); setExtracted(null);
    try {
      const res = await fetch("/api/memo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_memo: memo }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      setExtracted(d);
      setForm(prev => ({
        ...prev,
        name: prev.name || d.hospital_name || "",
        director_name: prev.director_name || d.manager_name || "",
        department: prev.department || d.department || "",
        special_notes: prev.special_notes || d.special_notes || "",
        doctor_count: prev.doctor_count || (d.doctors_count ? String(d.doctors_count) : ""),
      }));
    } catch (e: any) {
      setAnalyzeErr(e.message || "분석 실패");
    } finally {
      setAnalyzing(false);
    }
  };

  const goToQuote = () => {
    const items = [{ name: (extracted?.shooting_items || []).join(", ") || "촬영 서비스", detail: extracted?.purpose || "", unitPrice: 0, qty: 1, subtotal: 0, note: "" }];
    const data = { hospitalName: form.name, contactName: extracted?.manager_name || "", phone: extracted?.phone || "", email: extracted?.email || "", quoteDate: new Date().toISOString().slice(0, 10), items };
    router.push(`/quote?data=${encodeURIComponent(JSON.stringify(data))}${savedId ? `&client_id=${savedId}` : ""}`);
  };

  const iS: React.CSSProperties = {
    width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
    padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit",
    outline: "none", background: C.white, color: C.txt, boxSizing: "border-box",
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">상담 · 미팅 앱</span>
          </div>
        </div>
        <div className="pc-header-actions" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 20px" }}>
          {savedId
            ? <Link href={`/clients?id=${savedId}`} className="pc-header-back">← 고객 화면</Link>
            : <Link href="/clients" className="pc-header-back">← 고객 목록</Link>}
          <span style={{ fontSize: 10, fontWeight: 900, color: C.orange, border: `1px solid ${C.orange}40`, borderRadius: 99, padding: "3px 10px" }}>Step 1 · 상담/미팅</span>
          {savedId && <Link href={`/clients?id=${savedId}`} style={{ fontSize: 12, fontWeight: 800, color: C.teal, textDecoration: "none" }}>고객 상세 →</Link>}
        </div>
      </header>

      {savedId && (
        <div style={{ background: C.light, borderBottom: `1px solid ${C.border}`, padding: "8px 24px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.green }}>✓ 워크플로우 1단계 진행 중</span>
          <Link href={`/quote?client_id=${savedId}`} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: C.orange, textDecoration: "none" }}>2단계: 견적서 →</Link>
          <Link href={`/conti?client_id=${savedId}`} style={{ fontSize: 12, fontWeight: 800, color: C.teal, textDecoration: "none" }}>4단계: 콘티 →</Link>
        </div>
      )}

      <div className="pc-mobile-stack" style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px 60px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* 왼쪽: 병원 정보 폼 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <form onSubmit={saveClient}>
            <div style={{ background: C.white, borderRadius: 16, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "rgba(21,88,85,.04)", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: C.orange, letterSpacing: ".1em", marginBottom: 3 }}>STEP 1 · 상담/미팅</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.teal }}>병원 기본 정보</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {savedId ? "저장된 고객 정보를 수정할 수 있습니다." : "고객 등록 즉시 워크플로우 1단계가 자동 시작됩니다."}
                </div>
              </div>
              <div style={{ padding: "20px", display: "grid", gap: 14 }}>
                <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>병원이름 *</label>
                    <input value={form.name} onChange={set("name")} placeholder="포토클리닉" style={iS} required />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>원장이름</label>
                    <input value={form.director_name} onChange={set("director_name")} placeholder="정연호 원장" style={iS} />
                  </div>
                </div>
                <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>진료과</label>
                    <input value={form.department} onChange={set("department")} placeholder="피부과, 성형외과" style={iS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>의료진 수</label>
                    <input type="number" value={form.doctor_count} onChange={set("doctor_count")} placeholder="3" min="1" style={iS} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>주요 진료 / 시술</label>
                  <input value={form.main_treatments} onChange={set("main_treatments")} placeholder="리프팅, 보톡스, 필러, 레이저 토닝" style={iS} />
                </div>
                <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>홈페이지</label>
                    <input value={form.website_url} onChange={set("website_url")} placeholder="https://clinic.com" style={iS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>인스타그램</label>
                    <input value={form.instagram_url} onChange={set("instagram_url")} placeholder="@clinic_insta" style={iS} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>기타 (특이사항)</label>
                  <textarea value={form.special_notes} onChange={set("special_notes")} rows={2}
                    placeholder="원장님 직접 응대, 토요일 촬영 선호 등"
                    style={{ ...iS, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.6 }} />
                </div>

                {saveMsg && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: saveMsg.ok ? C.light : "#FFF0F0", color: saveMsg.ok ? C.green : C.orange, fontSize: 12, fontWeight: 700 }}>
                    {saveMsg.text}
                  </div>
                )}

                <button type="submit" disabled={saving || !form.name.trim()} className="pc-btn pc-btn--primary pc-btn--lg">
                  {saving ? "저장 중..." : savedId ? "정보 업데이트" : "✓ 고객 등록 + 워크플로우 시작"}
                </button>
              </div>
            </div>
          </form>

          {savedId && (
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "rgba(21,88,85,.03)", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>다음 단계로 이동</div>
              </div>
              <div style={{ padding: "12px", display: "grid", gap: 8 }}>
                {[
                  { label: "📄 2단계: 견적서 작성", href: `/quote?client_id=${savedId}`, primary: true },
                  { label: "✍️ 3단계: 계약서 작성", href: `/contract?client_id=${savedId}`, primary: false },
                  { label: "🎬 4단계: 촬영 콘티 생성", href: `/conti?client_id=${savedId}`, primary: false },
                  { label: "← 고객 상세 화면으로", href: `/clients?id=${savedId}`, primary: false },
                ].map(({ label, href, primary }) => (
                  <Link key={href} href={href} style={{
                    display: "block", textAlign: "center", height: 44, lineHeight: "44px",
                    background: primary ? C.orange : C.white, color: primary ? "#fff" : C.teal,
                    border: `1.5px solid ${primary ? C.orange : C.border}`,
                    borderRadius: 10, fontSize: 13, fontWeight: 800, textDecoration: "none",
                  }}>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 메모 + AI 분석 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", background: "rgba(124,58,237,.04)", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.purple }}>📝 상담 메모 + AI 자동 추출</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>자유롭게 메모하면 AI가 왼쪽 폼 빈 항목을 자동으로 채웁니다.</div>
            </div>
            <div style={{ padding: "20px" }}>
              <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={12}
                placeholder={`예시:\n강남 피부과 - 김실장 상담 (2026.06.15)\n\n원장님 프로필 촬영 + 시술 연출 + 공간사진 필요\n직원 3명 포함 단체사진도 원함\n촬영일은 7월 초 희망, 토요일 선호\n예산은 200-300 사이에서 조율 가능\n리프팅, 보톡스, 필러 위주 병원\n연락처: 010-1234-5678`}
                style={{
                  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
                  padding: "12px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.75,
                  resize: "vertical", outline: "none", background: C.white, color: C.txt, boxSizing: "border-box",
                }}
              />
              {analyzeErr && <div style={{ marginTop: 8, padding: "8px 12px", background: "#FFF0EB", borderRadius: 8, fontSize: 12, color: C.orange }}>⚠ {analyzeErr}</div>}
              <button onClick={analyze} disabled={analyzing || !memo.trim()} style={{
                width: "100%", marginTop: 12, height: 48, border: "none", borderRadius: 10,
                background: analyzing ? "#D8B4FE" : C.purple, color: "#fff",
                fontSize: 14, fontWeight: 800, cursor: analyzing || !memo.trim() ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: !memo.trim() ? 0.6 : 1,
              }}>
                {analyzing ? "AI 분석 중..." : "✨ AI 분석 + 자동 입력"}
              </button>
            </div>
          </div>

          {extracted && (
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", background: C.teal, color: "#fff" }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 3 }}>AI 분석 요약</div>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.65 }}>{extracted.summary || "분석 완료"}</div>
              </div>
              <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["담당자", extracted.manager_name],
                  ["연락처", extracted.phone],
                  ["이메일", extracted.email],
                  ["촬영 목적", extracted.purpose],
                  ["촬영 항목", (extracted.shooting_items || []).join(", ")],
                  ["희망 촬영일", extracted.preferred_date],
                  ["예산", extracted.budget],
                  ["추천 패키지", extracted.recommended_package],
                  ["다음 액션", extracted.next_action],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={String(label)} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 8, paddingBottom: 8, borderBottom: `1px solid ${C.light}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{label}</span>
                    <span style={{ fontSize: 12, color: C.txt }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={goToQuote} style={{ height: 38, padding: "0 16px", background: C.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  📄 견적서 바로 만들기
                </button>
                <Link href={`/conti${savedId ? `?client_id=${savedId}` : ""}`} style={{ height: 38, lineHeight: "38px", padding: "0 16px", background: C.white, color: C.teal, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                  🎬 콘티 생성
                </Link>
                <Link href="/calendar" style={{ height: 38, lineHeight: "38px", padding: "0 16px", background: C.white, color: C.teal, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                  📅 캘린더
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ConsultationPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: "center", color: "#9BB5B0" }}>로딩 중...</div>}>
      <ConsultationInner />
    </Suspense>
  );
}
