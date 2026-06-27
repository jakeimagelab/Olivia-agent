"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createMailingDraft } from "@/lib/mailingQueue";

type Review = {
  id: string; hospital_name: string; reviewer_name?: string;
  channel?: string; rating?: number; review_text: string;
  delivered_at?: string; permission_to_publish?: boolean; created_at?: string;
};

type GeneratedContent = {
  summary: string; insights: string[];
  carousel: { title: string; body: string }[];
  caption: string; hashtags: string;
};

const C = {
  teal: "#155855", orange: "#E85D2C",
  bg: "#EDF5F3", surface: "#FFFFFF", border: "#C8DDD9",
  muted: "#5A7470", hint: "#9BB5B0", txt: "#1C2B28", mint: "#EAF4F2",
};

export default function ReviewStudioPage() {
  const [reviews, setReviews]       = useState<Review[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage]       = useState("");
  const [content, setContent]       = useState<GeneratedContent | null>(null);
  const [isMobile, setIsMobile]     = useState(false);
  const [mobileTab, setMobileTab]   = useState<"form" | "list" | "result">("list");
  const [form, setForm] = useState({
    hospitalName: "", reviewerName: "", channel: "카카오톡",
    rating: "5", deliveredAt: "", reviewText: "", permissionToPublish: true,
  });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const inputStyle: React.CSSProperties = {
    width: "100%", border: `1px solid ${C.border}`, borderRadius: 9,
    padding: "10px 13px", fontSize: 13, fontFamily: "inherit",
    background: C.surface, color: C.txt, outline: "none",
  };

  const loadReviews = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/reviews");
      const data = await res.json();
      if (data.ok) setReviews(data.reviews || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadReviews(); }, []);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm(cur => ({ ...cur, [key]: value }));

  const toggleSelect = (id: string) =>
    setSelectedIds(cur => cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const res  = await fetch("/api/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, rating: form.rating ? Number(form.rating) : null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMessage("리뷰를 저장했습니다.");
      setForm({ hospitalName: "", reviewerName: "", channel: "카카오톡", rating: "5", deliveredAt: "", reviewText: "", permissionToPublish: true });
      await loadReviews();
      if (isMobile) setMobileTab("list");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally { setSaving(false); }
  };

  const generateContent = async () => {
    const selected = reviews.filter(r => selectedIds.includes(r.id));
    if (!selected.length) { setMessage("콘텐츠로 만들 리뷰를 선택해주세요."); return; }
    setGenerating(true); setMessage("");
    try {
      const res  = await fetch("/api/reviews/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalName: selected[0]?.hospital_name, reviews: selected, angle: "납품 후 고객 만족 후기" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setContent(data);
      setMessage("인스타그램 콘텐츠 초안을 만들었습니다.");
      if (isMobile) setMobileTab("result");
      const hospitalName = selected[0]?.hospital_name || "병원";
      createMailingDraft({
        type: "review_form", source_module: "review-studio", hospital_name: hospitalName,
        subject: `[포토클리닉] ${hospitalName} 리뷰 콘텐츠 초안`,
        body: `${hospitalName} 리뷰 기반 인스타그램 콘텐츠 초안입니다.\n\n${data.caption || ""}\n\n${data.hashtags || ""}`,
      }).then(() => setMessage(prev => prev + " · 메일링함에 저장됐습니다."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "생성 실패");
    } finally { setGenerating(false); }
  };

  /* ── 공통 UI 조각들 ── */
  const ReviewForm = () => (
    <form onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ background: C.mint, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.teal }}>클라이언트 후기 등록</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>받은 반응을 정리하고 홍보 콘텐츠로 재활용합니다.</div>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          {/* 2열 → 모바일 1열 */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <label className="field"><span>클라이언트명 *</span><input style={inputStyle} value={form.hospitalName} onChange={e => set("hospitalName", e.target.value)} placeholder="포토클리닉" /></label>
            <label className="field"><span>리뷰 작성자</span><input style={inputStyle} value={form.reviewerName} onChange={e => set("reviewerName", e.target.value)} placeholder="정연호" /></label>
          </div>
          {/* 3열 → 모바일 1열 */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10 }}>
            <label className="field"><span>채널</span><input style={inputStyle} value={form.channel} onChange={e => set("channel", e.target.value)} /></label>
            <label className="field"><span>만족도</span><input style={inputStyle} type="number" min="1" max="5" value={form.rating} onChange={e => set("rating", e.target.value)} /></label>
            <label className="field" style={isMobile ? { gridColumn: "1 / -1" } : {}}><span>납품일</span><input style={inputStyle} type="date" value={form.deliveredAt} onChange={e => set("deliveredAt", e.target.value)} /></label>
          </div>
          <label className="field"><span>리뷰 내용 *</span>
            <textarea style={{ ...inputStyle, minHeight: 130, resize: "vertical", lineHeight: 1.65 }} value={form.reviewText} onChange={e => set("reviewText", e.target.value)} placeholder="고객이 남긴 메시지, 카톡 답변, 통화 메모 등을 붙여넣으세요." />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", color: C.muted, fontSize: 13, fontWeight: 800 }}>
            <input type="checkbox" checked={form.permissionToPublish} onChange={e => set("permissionToPublish", e.target.checked)} style={{ width: 16, height: 16 }} />
            인스타그램 콘텐츠 활용 가능
          </label>
        </div>
      </div>
      <button disabled={saving} style={{ minHeight: 50, border: 0, borderRadius: 12, background: C.teal, color: "#fff", fontWeight: 900, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {saving ? "저장 중..." : "리뷰 저장"}
      </button>
      {message && <div style={{ color: message.includes("실패") || message.includes("선택") ? C.orange : C.teal, fontSize: 13, fontWeight: 800 }}>{message}</div>}
    </form>
  );

  const ReviewList = () => (
    <div style={{ display: "grid", gap: 10 }}>
      {loading && <div style={{ color: C.muted, padding: 20, textAlign: "center" }}>불러오는 중...</div>}
      {!loading && reviews.length === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>아직 리뷰가 없어요</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {isMobile ? "리뷰 등록 탭에서 추가하세요" : "왼쪽 폼으로 리뷰를 추가하세요"}
          </div>
        </div>
      )}
      {reviews.map(review => (
        <button key={review.id} type="button" onClick={() => toggleSelect(review.id)} style={{
          border: `1.5px solid ${selectedIds.includes(review.id) ? C.teal : C.border}`,
          borderRadius: 14, background: selectedIds.includes(review.id) ? "#F0F7F5" : C.surface,
          padding: 16, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
          boxShadow: "0 2px 12px rgba(21,88,85,.06)", transition: "all .15s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <strong style={{ color: C.teal, fontSize: 15 }}>{review.hospital_name}</strong>
            <span style={{ color: C.orange, fontSize: 12, fontWeight: 900 }}>{review.rating ? `${review.rating}/5` : review.channel}</span>
          </div>
          <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.65 }}>{review.review_text}</p>
        </button>
      ))}
    </div>
  );

  const GenerateButton = () => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
        선택한 리뷰 <strong style={{ color: C.teal }}>{selectedIds.length}</strong>개로 인스타 콘텐츠를 만듭니다.
      </div>
      <button onClick={generateContent} disabled={generating} style={{
        minHeight: 46, border: 0, borderRadius: 12, background: C.orange,
        color: "#fff", fontWeight: 900, cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit",
      }}>
        {generating ? "생성 중..." : "✨ 인스타 콘텐츠 생성"}
      </button>
    </div>
  );

  const ContentResult = () => !content ? null : (
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
            {content.insights.map((item, i) => <div key={i} style={{ background: "#F8FAFA", borderRadius: 10, padding: 12, color: C.muted, fontSize: 13 }}>{item}</div>)}
          </div>
        </section>
        <section>
          <h2 style={{ margin: "0 0 8px", color: C.teal, fontSize: 18 }}>카드뉴스</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {content.carousel.map((card, i) => (
              <div key={i} style={{ minHeight: 160, background: "#F8FAFA", border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
                <strong style={{ color: C.orange, fontSize: 12 }}>0{i + 1}</strong>
                <h3 style={{ margin: "10px 0 8px", color: C.teal, fontSize: 16, lineHeight: 1.35 }}>{card.title}</h3>
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
  );

  return (
    <div style={{ color: C.txt }}>

      {/* ── 히어로 배너 ── */}
      <div style={{ background: `linear-gradient(135deg, ${C.teal}, #22876A)`, color: "#fff", padding: "28px 24px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, opacity: .8, marginBottom: 4 }}>⭐ Review Studio</div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>클라이언트 후기 콘텐츠</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: .8 }}>받은 반응을 정리하고 인스타그램 홍보 콘텐츠로 재활용합니다.</p>
        </div>
      </div>

      {/* ── 모바일 탭 바 ── */}
      {isMobile && (
        <div style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 56, zIndex: 50 }}>
          {[
            { id: "list",   label: "📋 후기 목록" },
            { id: "form",   label: "✏️ 후기 등록" },
            { id: "result", label: "✨ 생성 결과", dot: !!content },
          ].map(tab => (
            <button key={tab.id} onClick={() => setMobileTab(tab.id as "form" | "list" | "result")} style={{
              flex: 1, height: 44, border: "none", background: "transparent",
              fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: "pointer",
              color: mobileTab === tab.id ? C.teal : C.muted, position: "relative",
              borderBottom: mobileTab === tab.id ? `2px solid ${C.teal}` : "2px solid transparent",
              transition: "all .15s",
            }}>
              {tab.label}
              {tab.dot && <span style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, borderRadius: "50%", background: C.orange }} />}
            </button>
          ))}
        </div>
      )}

      {/* ── 모바일 콘텐츠 ── */}
      {isMobile && (
        <div style={{ padding: "16px 16px 80px" }}>
          {mobileTab === "form" && <ReviewForm />}
          {mobileTab === "list" && (
            <div style={{ display: "grid", gap: 14 }}>
              <GenerateButton />
              <ReviewList />
            </div>
          )}
          {mobileTab === "result" && (
            <div style={{ display: "grid", gap: 14 }}>
              {!content && (
                <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>✨</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>후기 목록에서 리뷰를 선택한 후<br />콘텐츠를 생성하세요</div>
                  <button onClick={() => setMobileTab("list")} style={{ marginTop: 16, height: 44, padding: "0 24px", background: C.teal, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    📋 후기 목록으로
                  </button>
                </div>
              )}
              {message && <div style={{ color: message.includes("실패") || message.includes("선택") ? C.orange : C.teal, fontSize: 13, fontWeight: 800 }}>{message}</div>}
              <ContentResult />
            </div>
          )}
        </div>
      )}

      {/* ── 데스크탑 레이아웃 ── */}
      {!isMobile && (
        <section style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 20px", display: "grid", gridTemplateColumns: "410px 1fr", gap: 22, alignItems: "start" }}>
          <ReviewForm />
          <section style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 230px", gap: 12, alignItems: "start" }}>
              <ReviewList />
              <div style={{ position: "sticky", top: 18 }}>
                <GenerateButton />
                {message && <div style={{ marginTop: 10, color: message.includes("실패") || message.includes("선택") ? C.orange : C.teal, fontSize: 12, fontWeight: 800 }}>{message}</div>}
              </div>
            </div>
            <ContentResult />
          </section>
        </section>
      )}
    </div>
  );
}
