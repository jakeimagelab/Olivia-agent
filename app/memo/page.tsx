"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#EDF5F3",
  surface: "#FFFFFF", border: "#C8DDD9", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", mint: "#EAF4F2",
};

const iS: React.CSSProperties = {
  width: "100%", border: `1px solid ${C.border}`, borderRadius: 9,
  padding: "10px 13px", fontSize: 13, fontFamily: "inherit",
  background: C.surface, color: C.txt, outline: "none",
};

type HistoryMemo = {
  id: string;
  raw_memo: string;
  summary: string;
  extracted_data: Extracted | null;
  recommended_package: string;
  next_action: string;
  created_at: string;
};

type Extracted = {
  summary?: string;
  hospital_name?: string;
  manager_name?: string;
  phone?: string;
  email?: string;
  department?: string;
  purpose?: string;
  shooting_items?: string[];
  doctors_count?: string;
  staff_count?: string;
  locations?: string;
  needs_video?: boolean;
  needs_website?: boolean;
  interested_in_sns?: boolean;
  preferred_date?: string;
  budget?: string;
  special_notes?: string;
  recommended_package?: string;
  next_action?: string;
};

const NEXT_ACTIONS = ["견적서 만들기", "콘티 만들기", "제안서 만들기", "병원 이미지 진단 시작하기", "클라이언트 등록하기"];

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function MemoPage() {
  const searchParams = useSearchParams();
  const dateParam    = searchParams.get("date") ?? "";

  const [rawMemo, setRawMemo]           = useState("");
  const [analyzing, setAnalyzing]       = useState(false);
  const [result, setResult]             = useState<Extracted | null>(null);
  const [edited, setEdited]             = useState<Extracted>(() => dateParam ? { preferred_date: dateParam } : {});
  const [error, setError]               = useState("");
  const [saved, setSaved]               = useState(false);
  const [calAdding, setCalAdding]       = useState(false);
  const [calSaved, setCalSaved]         = useState(false);
  const [calError, setCalError]         = useState("");
  const [history, setHistory]           = useState<HistoryMemo[]>([]);
  const [historyOpen, setHistoryOpen]   = useState(true);
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/memo").then(r => r.json()).then(d => { if (d.ok) setHistory(d.memos); }).catch(() => {});
  }, []);

  const analyze = async () => {
    if (!rawMemo.trim()) { setError("상담 메모를 입력해주세요."); return; }
    setAnalyzing(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_memo: rawMemo }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult(data);
      setEdited({ ...data, preferred_date: data.preferred_date || dateParam || "" });
      setSaved(false);
    } catch (e: any) {
      setError(e.message || "분석에 실패했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  const upd = (key: keyof Extracted, val: any) =>
    setEdited(prev => ({ ...prev, [key]: val }));

  const addToCalendar = async () => {
    const date = edited.preferred_date?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!date) { setCalError("희망 촬영일이 없어요. 날짜를 직접 입력해주세요 (예: 2026-07-05)"); return; }
    setCalAdding(true); setCalError("");
    try {
      const title = [edited.hospital_name, "촬영 일정"].filter(Boolean).join(" ");
      const memo  = [
        edited.summary,
        edited.shooting_items?.length ? "항목: " + edited.shooting_items.join(", ") : "",
        edited.budget ? "예산: " + edited.budget : "",
        edited.special_notes,
      ].filter(Boolean).join("\n");
      const res  = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, title, memo, category: "shooting", location: edited.hospital_name || null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setCalSaved(true);
      try {
        const consultKey = `cal_consult_${date}`;
        const existing: object[] = JSON.parse(localStorage.getItem(consultKey) || "[]");
        existing.push({
          hospital: edited.hospital_name || "미입력",
          summary: edited.summary || "",
          items: edited.shooting_items || [],
          budget: edited.budget || "",
          savedAt: new Date().toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        });
        localStorage.setItem(consultKey, JSON.stringify(existing));
      } catch {}
    } catch (e: any) {
      setCalError(e.message || "캘린더 저장 실패");
    } finally {
      setCalAdding(false);
    }
  };

  const goToQuote = () => {
    const data = edited;
    const items = [{
      name: (data.shooting_items || []).join(", ") || "촬영 서비스",
      detail: data.purpose || "",
      unitPrice: 0, qty: 1, subtotal: 0, note: "",
    }];
    const quoteData = {
      hospitalName:  data.hospital_name || "",
      contactName:   data.manager_name  || "",
      phone:         data.phone         || "",
      email:         data.email         || "",
      quoteNumber:   `PC-${new Date().toISOString().slice(0,10).replace(/-/g,"")}`,
      quoteDate:     new Date().toISOString().slice(0,10),
      shootDate:     data.preferred_date || null,
      validUntil:    "",
      items,
      supplyAmount: 0, discountAmount: 0, vat: 0,
      totalAmount: 0, depositAmount: 0, balanceAmount: 0,
      memos: data.special_notes || "",
    };
    window.location.href = `/quote?data=${encodeURIComponent(JSON.stringify(quoteData))}`;
  };

  const InfoRow = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "center", paddingBottom: 8, borderBottom: `1px solid ${C.mint}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{label}</span>
      <input value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12 }} />
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif", color: C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href="/" className="pc-header-back">← 관리자 홈</Link>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">올리비아 메모</span>
          </div>
        </div>
      </header>

      {dateParam && (
        <div style={{ maxWidth: 1100, margin: "8px auto 0", padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#EAF4F2",
            border: "1px solid #C8DDD9", borderRadius: 10, padding: "10px 16px" }}>
            <span style={{ fontSize: 13 }}>📅</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>
              {dateParam} 일정에서 연결됐어요.
            </span>
            <span style={{ fontSize: 12, color: C.muted }}>메모 분석 후 해당 날짜로 자동 등록됩니다.</span>
            <a href="/calendar" style={{ marginLeft: "auto", fontSize: 11, color: C.teal,
              fontWeight: 800, textDecoration: "none" }}>← 캘린더로</a>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px", display: "grid", gridTemplateColumns: result ? "1fr 1fr" : "1fr", gap: 22, alignItems: "start" }}>

        {/* 메모 입력 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.teal }}>📝 상담/미팅 메모</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>자유롭게 메모하세요. AI가 자동으로 분석하고 견적서에 필요한 정보를 추출합니다.</div>
            </div>
            <div style={{ padding: 20 }}>
              <textarea
                value={rawMemo}
                onChange={e => setRawMemo(e.target.value)}
                placeholder={`예시:\n강남 피부과 - 김실장 상담 (2026.06.15)\n\n원장님 프로필 촬영 + 시술 연출 + 공간사진 필요\n직원 3명 포함 단체사진도 원함\n촬영일은 7월 초 희망, 토요일 선호\n예산은 200-300 사이에서 조율 가능하다고 함\n인스타 운영도 관심 있음\n연락처: 010-1234-5678 / kim@skincare.kr`}
                rows={14}
                style={{ ...iS, resize: "vertical", lineHeight: 1.8, fontSize: 13 }}
              />
              {error && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#FFF0EB", border: `1px solid #FACCB8`, borderRadius: 8, fontSize: 12, color: C.orange }}>
                  ⚠ {error}
                </div>
              )}
              <button
                onClick={analyze}
                disabled={analyzing}
                style={{ width: "100%", marginTop: 14, height: 50, border: "none", borderRadius: 10, background: analyzing ? C.hint : C.teal, color: "#fff", fontSize: 15, fontWeight: 800, cursor: analyzing ? "not-allowed" : "pointer", fontFamily: "inherit" }}
              >
                {analyzing ? "AI 분석 중..." : "✨ AI 분석하기"}
              </button>
            </div>
          </div>

          {/* 샘플 힌트 */}
          {!result && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.teal, marginBottom: 10 }}>💡 메모 작성 팁</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                <span>· 날짜, 병원명, 담당자 이름을 첫 줄에 메모</span>
                <span>· 필요한 촬영 항목, 원장·직원 수 간략히</span>
                <span>· 희망 촬영일, 예산 범위 포함하면 정확도 향상</span>
                <span>· 영상, 홈페이지, SNS 구독 관심 여부 메모</span>
              </div>
            </div>
          )}
        </div>

        {/* 분석 결과 */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* 요약 */}
            <div style={{ background: C.teal, borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
              <div style={{ fontSize: 11, opacity: .7, marginBottom: 4 }}>AI 분석 요약</div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.7 }}>{edited.summary || "—"}</div>
            </div>

            {/* 추출 정보 편집 */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ background: C.mint, padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.teal }}>📋 추출된 정보 (수정 가능)</div>
              </div>
              <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                <InfoRow label="병원명" value={edited.hospital_name || ""} onChange={v => upd("hospital_name", v)} />
                <InfoRow label="담당자" value={edited.manager_name || ""} onChange={v => upd("manager_name", v)} />
                <InfoRow label="연락처" value={edited.phone || ""} onChange={v => upd("phone", v)} />
                <InfoRow label="이메일" value={edited.email || ""} onChange={v => upd("email", v)} />
                <InfoRow label="진료과" value={edited.department || ""} onChange={v => upd("department", v)} />
                <InfoRow label="촬영 목적" value={edited.purpose || ""} onChange={v => upd("purpose", v)} />
                <InfoRow label="희망 촬영일" value={edited.preferred_date || ""} onChange={v => upd("preferred_date", v)} />
                <InfoRow label="예산" value={edited.budget || ""} onChange={v => upd("budget", v)} />
                <div style={{ paddingBottom: 8, borderBottom: `1px solid ${C.mint}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5 }}>촬영 항목</div>
                  <textarea
                    value={(edited.shooting_items || []).join(", ")}
                    onChange={e => upd("shooting_items", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                    rows={2}
                    style={{ ...iS, fontSize: 12, resize: "none" }}
                  />
                </div>
                <InfoRow label="특이사항" value={edited.special_notes || ""} onChange={v => upd("special_notes", v)} />

                <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
                  {[
                    { key: "needs_video", label: "영상 필요" },
                    { key: "needs_website", label: "홈페이지 필요" },
                    { key: "interested_in_sns", label: "SNS 구독 관심" },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={Boolean((edited as any)[key])}
                        onChange={e => upd(key as keyof Extracted, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 추천 패키지 & 다음 액션 */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.teal, marginBottom: 10 }}>💡 AI 추천</div>
              <div style={{ fontSize: 13, color: C.orange, fontWeight: 700, marginBottom: 6 }}>
                추천 패키지: {edited.recommended_package || "—"}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                다음 액션: {edited.next_action || "—"}
              </div>
            </div>

            {/* 캘린더 추가 */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.teal, marginBottom: 4 }}>📅 촬영 일정 캘린더 등록</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>
                희망 촬영일 <strong style={{ color: C.teal }}>{edited.preferred_date || "미입력"}</strong>로 캘린더에 일정을 추가합니다.
              </div>
              {calSaved ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, padding: "9px 13px", background: "#E6F4EA", border: "1px solid #86EFAC",
                    borderRadius: 9, fontSize: 12, color: "#166534", fontWeight: 700 }}>
                    ✅ 캘린더에 추가됐어요!
                  </div>
                  <a href="/calendar" style={{ padding: "9px 14px", background: C.teal, color: "#fff",
                    borderRadius: 9, fontSize: 12, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" }}>
                    캘린더 보기 →
                  </a>
                </div>
              ) : (
                <>
                  <button onClick={addToCalendar} disabled={calAdding}
                    style={{ width: "100%", height: 42, border: "none", borderRadius: 9,
                      background: calAdding ? C.hint : "#0F4440", color: "#fff",
                      fontSize: 13, fontWeight: 800, cursor: calAdding ? "not-allowed" : "pointer",
                      fontFamily: "inherit" }}>
                    {calAdding ? "추가 중…" : "📅 캘린더에 일정 추가"}
                  </button>
                  {calError && (
                    <div style={{ marginTop: 8, fontSize: 11, color: C.orange, background: "#FFF0EB",
                      borderRadius: 7, padding: "7px 11px" }}>⚠ {calError}</div>
                  )}
                </>
              )}
            </div>

            {/* 액션 버튼 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 2 }}>다음 단계로 이동</div>
              {NEXT_ACTIONS.map(action => {
                let href = "#";
                let highlight = false;
                if (action === "견적서 만들기") { highlight = true; }
                if (action === "콘티 만들기") href = "/conti";
                if (action === "병원 이미지 진단 시작하기") href = "/diagnosis";
                if (action === "클라이언트 등록하기") href = "/clients";

                return action === "견적서 만들기" ? (
                  <button
                    key={action}
                    onClick={goToQuote}
                    style={{ width: "100%", height: 46, border: "none", borderRadius: 10, background: C.orange, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    📄 {action}
                  </button>
                ) : (
                  <Link
                    key={action}
                    href={href}
                    style={{ display: "block", width: "100%", height: 46, lineHeight: "46px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, color: C.teal, fontWeight: 700, fontSize: 13, textDecoration: "none" }}
                  >
                    {action}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function MemoPageWrapper() {
  return (
    <Suspense>
      <MemoPage />
    </Suspense>
  );
}
