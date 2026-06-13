"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Review = {
  id: string;
  hospital_name: string;
  reviewer_name?: string;
  channel?: string;
  rating?: number;
  review_text: string;
  delivered_at?: string;
  permission_to_publish?: boolean;
  created_at?: string;
};

type GeneratedContent = {
  summary: string;
  insights: string[];
  carousel: { title: string; body: string }[];
  caption: string;
  hashtags: string;
};

const C = {
  teal: "#155855",
  orange: "#E85D2C",
  bg: "#EDF5F3",
  surface: "#FFFFFF",
  border: "#C8DDD9",
  muted: "#5A7470",
  hint: "#9BB5B0",
  txt: "#1C2B28",
  mint: "#EAF4F2"
};

export default function ReviewStudioPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [form, setForm] = useState({
    hospitalName: "",
    reviewerName: "",
    channel: "카카오톡",
    rating: "5",
    deliveredAt: "",
    reviewText: "",
    permissionToPublish: true
  });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${C.border}`,
    borderRadius: 9,
    padding: "10px 13px",
    fontSize: 13,
    fontFamily: "inherit",
    background: C.surface,
    color: C.txt,
    outline: "none"
  };

  const loadReviews = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews");
      const data = await res.json();
      if (data.ok) setReviews(data.reviews || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const set = (key: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          rating: form.rating ? Number(form.rating) : null
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMessage("리뷰를 저장했습니다.");
      setForm({ hospitalName: "", reviewerName: "", channel: "카카오톡", rating: "5", deliveredAt: "", reviewText: "", permissionToPublish: true });
      await loadReviews();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const generateContent = async () => {
    const selected = reviews.filter((review) => selectedIds.includes(review.id));
    if (!selected.length) {
      setMessage("콘텐츠로 만들 리뷰를 선택해주세요.");
      return;
    }

    setGenerating(true);
    setMessage("");
    try {
      const res = await fetch("/api/reviews/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospitalName: selected[0]?.hospital_name,
          reviews: selected,
          angle: "납품 후 고객 만족 후기"
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setContent(data);
      setMessage("인스타그램 콘텐츠 초안을 만들었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "생성 실패");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif", color: C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href="/" className="pc-header-back">← 관리자 홈</Link>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">Review Studio</span>
          </div>
        </div>
      </header>

      <section style={{ maxWidth: 1220, margin: "0 auto", padding: "28px 20px", display: "grid", gridTemplateColumns: "410px 1fr", gap: 22, alignItems: "start" }}>
        <form onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.teal }}>납품 후 리뷰 수집</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>사진/영상 전달 후 받은 반응을 DB에 정리합니다.</div>
            </div>
            <div style={{ padding: 20, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field"><span>병원명 *</span><input style={inputStyle} value={form.hospitalName} onChange={(e) => set("hospitalName", e.target.value)} placeholder="온유성형외과" /></label>
                <label className="field"><span>작성자</span><input style={inputStyle} value={form.reviewerName} onChange={(e) => set("reviewerName", e.target.value)} placeholder="김실장님" /></label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <label className="field"><span>채널</span><input style={inputStyle} value={form.channel} onChange={(e) => set("channel", e.target.value)} /></label>
                <label className="field"><span>만족도</span><input style={inputStyle} type="number" min="1" max="5" value={form.rating} onChange={(e) => set("rating", e.target.value)} /></label>
                <label className="field"><span>납품일</span><input style={inputStyle} type="date" value={form.deliveredAt} onChange={(e) => set("deliveredAt", e.target.value)} /></label>
              </div>
              <label className="field"><span>리뷰 내용 *</span><textarea style={{ ...inputStyle, minHeight: 150, resize: "vertical", lineHeight: 1.65 }} value={form.reviewText} onChange={(e) => set("reviewText", e.target.value)} placeholder="고객이 남긴 메시지, 카톡 답변, 통화 메모 등을 붙여넣으세요." /></label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", color: C.muted, fontSize: 13, fontWeight: 800 }}>
                <input type="checkbox" checked={form.permissionToPublish} onChange={(e) => set("permissionToPublish", e.target.checked)} style={{ width: 16, height: 16 }} />
                인스타그램 콘텐츠 활용 가능
              </label>
            </div>
          </div>
          <button disabled={saving} style={{ minHeight: 50, border: 0, borderRadius: 12, background: C.teal, color: "#fff", fontWeight: 900, fontSize: 15 }}>
            {saving ? "저장 중..." : "리뷰 저장"}
          </button>
          {message ? <div style={{ color: message.includes("실패") || message.includes("선택") ? C.orange : C.teal, fontSize: 13, fontWeight: 800 }}>{message}</div> : null}
        </form>

        <section style={{ display: "grid", gap: 16 }}>
          <div>
            <p style={{ margin: 0, color: C.orange, fontSize: 12, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Review Content</p>
            <h1 style={{ margin: "6px 0 0", color: C.teal, fontSize: 42, lineHeight: 1.15 }}>리뷰 기반 인스타 콘텐츠</h1>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 230px", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 10 }}>
              {loading ? <div style={{ color: C.muted }}>불러오는 중...</div> : null}
              {reviews.map((review) => (
                <button key={review.id} type="button" onClick={() => toggleSelect(review.id)}
                  style={{
                    border: `1px solid ${selectedIds.includes(review.id) ? C.teal : C.border}`,
                    borderRadius: 14,
                    background: selectedIds.includes(review.id) ? "#F0F7F5" : C.surface,
                    padding: 16,
                    textAlign: "left",
                    boxShadow: "0 12px 28px rgba(21,88,85,.06)"
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <strong style={{ color: C.teal, fontSize: 16 }}>{review.hospital_name}</strong>
                    <span style={{ color: C.orange, fontSize: 12, fontWeight: 900 }}>{review.rating ? `${review.rating}/5` : review.channel}</span>
                  </div>
                  <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.65 }}>{review.review_text}</p>
                </button>
              ))}
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: "grid", gap: 12, position: "sticky", top: 18 }}>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                선택한 리뷰 <strong style={{ color: C.teal }}>{selectedIds.length}</strong>개로 요약과 카드뉴스, 캡션을 만듭니다.
              </div>
              <button onClick={generateContent} disabled={generating} style={{ minHeight: 46, border: 0, borderRadius: 12, background: C.orange, color: "#fff", fontWeight: 900 }}>
                {generating ? "생성 중..." : "인스타 콘텐츠 생성"}
              </button>
            </div>
          </div>

          {content ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" }}>
              <div style={{ background: C.mint, padding: "14px 20px", borderBottom: `1px solid ${C.border}`, color: C.teal, fontWeight: 900 }}>생성 결과</div>
              <div style={{ padding: 20, display: "grid", gap: 18 }}>
                <section>
                  <h2 style={{ margin: "0 0 8px", color: C.teal, fontSize: 18 }}>요약</h2>
                  <p style={{ margin: 0, color: C.muted, lineHeight: 1.75 }}>{content.summary}</p>
                </section>
                <section>
                  <h2 style={{ margin: "0 0 8px", color: C.teal, fontSize: 18 }}>인사이트</h2>
                  <div style={{ display: "grid", gap: 8 }}>
                    {content.insights.map((item, index) => <div key={index} style={{ background: "#F8FAFA", borderRadius: 10, padding: 12, color: C.muted, fontSize: 13 }}>{item}</div>)}
                  </div>
                </section>
                <section>
                  <h2 style={{ margin: "0 0 8px", color: C.teal, fontSize: 18 }}>카드뉴스</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                    {content.carousel.map((card, index) => (
                      <div key={index} style={{ minHeight: 170, background: "#F8FAFA", border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
                        <strong style={{ color: C.orange, fontSize: 12 }}>0{index + 1}</strong>
                        <h3 style={{ margin: "10px 0 8px", color: C.teal, fontSize: 17, lineHeight: 1.35 }}>{card.title}</h3>
                        <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.65 }}>{card.body}</p>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h2 style={{ margin: "0 0 8px", color: C.teal, fontSize: 18 }}>캡션</h2>
                  <pre style={{ whiteSpace: "pre-wrap", margin: 0, color: C.muted, background: "#F8FAFA", borderRadius: 12, padding: 14, fontFamily: "inherit", lineHeight: 1.7 }}>{content.caption}</pre>
                  <p style={{ margin: "10px 0 0", color: C.orange, fontSize: 12, fontWeight: 800 }}>{content.hashtags}</p>
                </section>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
