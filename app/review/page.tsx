"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#EDF5F3",
  white: "#FFFFFF", border: "#E2EDEB", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", mint: "#EAF4F2",
};

const STAR_LABELS = ["", "별로였어요", "아쉬웠어요", "보통이에요", "좋았어요", "최고였어요!"];

function StarIcon({ filled, size = 36 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={filled ? C.orange : "#D9E8E5"}
      />
    </svg>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, display: "flex" }}>
            <StarIcon filled={n <= active} size={36} />
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: active ? C.orange : "transparent", height: 16 }}>
        {STAR_LABELS[active] || "ㅤ"}
      </div>
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
    {children}
  </div>
);

function ReviewForm() {
  const params = useSearchParams();
  const hospitalParam  = params.get("hospital") || "";
  const nameParam      = params.get("name") || "";

  const [step,         setStep]         = useState<"form" | "done">("form");
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState("");

  const [rating,       setRating]       = useState(0);
  const [reviewText,   setReviewText]   = useState("");
  const [improveText,  setImproveText]  = useState("");
  const [permission,   setPermission]   = useState(true);
  const [reviewerName, setReviewerName] = useState(nameParam);

  const inputStyle: React.CSSProperties = {
    width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 12,
    padding: "13px 16px", fontSize: 14, fontFamily: "inherit",
    background: C.white, color: C.txt, outline: "none",
    boxSizing: "border-box", lineHeight: 1.6,
    transition: "border-color .15s",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) { setError("별점을 선택해주세요."); return; }
    if (!reviewText.trim()) { setError("후기 내용을 입력해주세요."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospitalName:        hospitalParam,
          reviewerName:        reviewerName.trim() || "익명",
          channel:             "이메일 링크",
          rating,
          reviewText:          reviewText.trim(),
          improveText:         improveText.trim(),
          deliveredAt:         new Date().toISOString().slice(0, 10),
          permissionToPublish: permission,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setStep("done");
    } catch (e: any) {
      setError(e.message || "저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") {
    return (
      <div style={{ textAlign: "center", padding: "52px 24px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
          {[1,2,3,4,5].map(n => <StarIcon key={n} filled={n <= rating} size={32} />)}
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>감사합니다</div>
        <h2 style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 800, color: C.teal }}>
          소중한 후기가 전달됐어요
        </h2>
        <p style={{ margin: "0 0 6px", fontSize: 14, color: C.muted, lineHeight: 1.8 }}>
          {hospitalParam && <><strong style={{ color: C.txt }}>{hospitalParam}</strong>와 함께한 시간,<br/></>}
          더욱 의미 있게 기억하겠습니다.
        </p>
        <p style={{ margin: "20px 0 0", fontSize: 13, color: C.hint }}>포토클리닉 대표 정연호 드림.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* 병원 배지 */}
      {hospitalParam && (
        <div style={{ background: C.mint, borderRadius: 12, padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 2 }}>촬영 병원</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.teal }}>{hospitalParam}</div>
          </div>
        </div>
      )}

      {/* 성함 */}
      <div style={{ marginBottom: 22 }}>
        <SectionLabel>성함</SectionLabel>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.txt, marginBottom: 10 }}>
          이름을 알려주세요 <span style={{ fontSize: 13, fontWeight: 400, color: C.hint }}>(선택)</span>
        </div>
        <input
          type="text"
          value={reviewerName}
          onChange={e => setReviewerName(e.target.value)}
          placeholder="원장님 성함 또는 닉네임"
          style={inputStyle}
        />
      </div>

      {/* 별점 */}
      <div style={{ marginBottom: 22 }}>
        <SectionLabel>만족도</SectionLabel>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.txt, marginBottom: 12 }}>
          촬영은 어떠셨나요? <span style={{ color: C.orange, fontSize: 14 }}>*</span>
        </div>
        <StarRating value={rating} onChange={setRating} />
      </div>

      {/* 후기 */}
      <div style={{ marginBottom: 22 }}>
        <SectionLabel>촬영 후기</SectionLabel>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.txt, marginBottom: 10 }}>
          솔직한 경험을 공유해주세요 <span style={{ color: C.orange, fontSize: 14 }}>*</span>
        </div>
        <textarea
          value={reviewText}
          onChange={e => setReviewText(e.target.value)}
          placeholder={"촬영 경험이나 결과물에 대한 솔직한 후기를 남겨주세요.\n예) 스태프들이 편안하게 이끌어주셨어요. 결과물도 기대 이상이었습니다."}
          rows={5}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <div style={{ fontSize: 11, color: C.hint, marginTop: 5, textAlign: "right" }}>{reviewText.length}자</div>
      </div>

      {/* 개선점 */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>개선점</SectionLabel>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.txt, marginBottom: 10 }}>
          개선했으면 하는 점 <span style={{ fontSize: 13, fontWeight: 400, color: C.hint }}>(선택)</span>
        </div>
        <textarea
          value={improveText}
          onChange={e => setImproveText(e.target.value)}
          placeholder={"더 나은 서비스를 위해 솔직하게 말씀해주세요.\n예) 대기 시간이 조금 길었어요."}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", background: "#F8FBFA" }}
        />
      </div>

      {/* 동의 */}
      <div
        onClick={() => setPermission(p => !p)}
        style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer",
          background: permission ? C.mint : "#FAFAFA",
          border: `1.5px solid ${permission ? C.teal : C.border}`,
          borderRadius: 14, padding: "14px 16px", marginBottom: 20 }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
          background: permission ? C.teal : C.white,
          border: `2px solid ${permission ? C.teal : C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {permission && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.txt, marginBottom: 4 }}>후기 콘텐츠 활용 동의</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
            작성하신 후기를 포토클리닉 SNS·홈페이지 콘텐츠에 활용할 수 있도록 동의합니다.
            (병원명 비공개 가능, 언제든 철회 가능)
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#FFF0EB", borderRadius: 10, fontSize: 13, color: C.orange, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} style={{
        height: 56, border: "none", borderRadius: 14,
        background: submitting ? C.hint : C.teal, color: "#fff",
        fontWeight: 800, fontSize: 16, cursor: submitting ? "not-allowed" : "pointer",
        fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        {submitting ? "저장 중…" : (
          <>
            후기 제출하기
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </>
        )}
      </button>

      <p style={{ textAlign: "center", fontSize: 11, color: C.hint, margin: "16px 0 0", lineHeight: 1.7 }}>
        소중한 후기는 더 나은 촬영 서비스를 만드는 데 큰 힘이 됩니다.
      </p>
    </form>
  );
}

export default function ReviewPage() {
  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif", color: C.txt }}>

      <div style={{ background: C.teal, padding: "22px 24px 22px", textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 5 }}>PHOTO CLINIC</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>촬영 후기</div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 16px 100px" }}>

        {/* 헤더 카드 */}
        <div style={{ background: C.white, borderRadius: 16, padding: "24px 24px 20px", border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 4 }}>Review</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.txt, lineHeight: 1.3 }}>촬영은 어떠셨나요?</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>1분이면 충분해요. 솔직한 후기가 큰 힘이 됩니다.</div>
            </div>
          </div>
        </div>

        {/* 폼 카드 */}
        <div style={{ background: C.white, borderRadius: 16, padding: "28px 24px", border: `1px solid ${C.border}` }}>
          <Suspense fallback={<div style={{ padding: "40px 0", textAlign: "center", color: C.hint }}>불러오는 중…</div>}>
            <ReviewForm />
          </Suspense>
        </div>

      </div>
    </main>
  );
}
