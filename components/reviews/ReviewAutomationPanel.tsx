"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Instagram, RefreshCw, Send, Sparkles, Upload } from "lucide-react";
import { C, R } from "@/lib/theme";
import { getSupabase } from "@/lib/supabase";

type LayoutAsset = {
  id: string;
  name: string;
  description?: string;
  asset_type: string;
  referenceUrl?: string | null;
};

type Variant = {
  id: string;
  imageUrl?: string | null;
  is_selected?: boolean;
  review_layout_assets?: LayoutAsset | null;
};

type ReviewContent = {
  id: string;
  status: string;
  caption: string;
  hashtags: string;
  summary: string;
  selected_variant_id?: string | null;
  client_reviews?: {
    public_review_text?: string;
    clients?: { hospital_name?: string; name?: string } | null;
  } | null;
  review_content_variants?: Variant[];
};

const panel: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: R.xl,
  background: C.white,
  padding: 18,
  minWidth: 0,
};

const button: React.CSSProperties = {
  minHeight: 38,
  border: 0,
  borderRadius: R.md,
  padding: "8px 12px",
  background: C.teal,
  color: C.white,
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  cursor: "pointer",
};

export default function ReviewAutomationPanel({ refreshKey }: { refreshKey?: string | null }) {
  const [contents, setContents] = useState<ReviewContent[]>([]);
  const [layouts, setLayouts] = useState<LayoutAsset[]>([]);
  const [instagram, setInstagram] = useState<{ connected: boolean; account?: { username?: string }; configured?: boolean } | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedLayouts, setSelectedLayouts] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [contentResult, layoutResult, instagramResult] = await Promise.all([
      fetch("/api/review-contents", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/review-layout-assets", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/instagram/status", { cache: "no-store" }).then((res) => res.json()),
    ]);
    if (contentResult.ok) setContents(contentResult.contents || []);
    if (layoutResult.ok) {
      const nextLayouts = layoutResult.assets || [];
      setLayouts(nextLayouts);
      setSelectedLayouts((current) => current.length
        ? current.filter((id) => nextLayouts.some((item: LayoutAsset) => item.id === id)).slice(0, 3)
        : nextLayouts.slice(0, 3).map((item: LayoutAsset) => item.id));
    }
    if (instagramResult.ok) setInstagram(instagramResult);
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage("콘텐츠 자동화 정보를 불러오지 못했습니다."));
  }, [load, refreshKey]);

  const createVariants = async (contentId: string) => {
    if (busy) return;
    if (!selectedLayouts.length) {
      setMessage("시안 생성에 사용할 레이아웃을 1개 이상 선택해주세요.");
      return;
    }
    setBusy(`variants:${contentId}`);
    setMessage("");
    try {
      const response = await fetch(`/api/review-contents/${contentId}/generate-variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layoutAssetIds: selectedLayouts }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setMessage("올리비아가 레이아웃 시안 3개를 만들었습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "시안 생성 실패");
    } finally {
      setBusy("");
    }
  };

  const approve = async (contentId: string) => {
    const variantId = selectedVariants[contentId];
    if (!variantId || busy) {
      setMessage("승인할 이미지 시안을 먼저 선택해주세요.");
      return;
    }
    setBusy(`approve:${contentId}`);
    try {
      const response = await fetch(`/api/review-contents/${contentId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setMessage("대표 승인했습니다. Instagram 게시 준비가 완료됐습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "승인 실패");
    } finally {
      setBusy("");
    }
  };

  const publish = async (contentId: string) => {
    if (busy) return;
    if (!window.confirm("승인된 이미지와 캡션을 포토클리닉 Instagram에 게시할까요?")) return;
    setBusy(`publish:${contentId}`);
    try {
      const response = await fetch("/api/instagram/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      setMessage(data.alreadyPublished ? "이미 게시된 콘텐츠입니다." : "Instagram 게시를 완료했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Instagram 게시 실패");
    } finally {
      setBusy("");
    }
  };

  const uploadReference = async (file: File) => {
    if (busy) return;
    setBusy("layout");
    try {
      const sessionResponse = await fetch("/api/review-layout-assets/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok || !session.ok) throw new Error(session.error);
      const { error: uploadError } = await getSupabase().storage
        .from(session.bucket)
        .uploadToSignedUrl(session.storagePath, session.token, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const assetResponse = await fetch("/api/review-layout-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 120),
          description: "업로드한 레퍼런스에서 추출한 레이아웃",
          ratio: "4:5",
          assetType: "reference",
          referenceStoragePath: session.storagePath,
        }),
      });
      const assetData = await assetResponse.json();
      if (!assetResponse.ok || !assetData.ok) throw new Error(assetData.error);
      const analyzeResponse = await fetch(`/api/review-layout-assets/${assetData.asset.id}/analyze`, { method: "POST" });
      const analyzed = await analyzeResponse.json();
      if (!analyzeResponse.ok || !analyzed.ok) throw new Error(analyzed.error);
      setSelectedLayouts((current) => [assetData.asset.id, ...current.filter((id) => id !== assetData.asset.id)].slice(0, 3));
      setMessage("레퍼런스 디자인을 레이아웃 에셋으로 등록했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "레이아웃 등록 실패");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section style={{ display: "grid", gap: 12, fontFamily: "var(--font-sans)" }}>
      <div style={{ ...panel, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.orange, fontSize: 9, fontWeight: 700, letterSpacing: ".08em" }}>OLIVIA REVIEW AUTOMATION</div>
          <h2 style={{ margin: "4px 0 0", color: C.ink, fontSize: 18, fontWeight: 700 }}>리뷰 → Instagram</h2>
          <p style={{ margin: "4px 0 0", color: C.muted, fontSize: 11 }}>올리비아가 리뷰를 선택하고 시안을 만들며, 게시 전에는 대표 승인이 필요합니다.</p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {instagram?.connected ? (
            <span style={{ ...button, background: C.mint, color: C.teal, cursor: "default" }}><Check size={13} /> @{instagram.account?.username || "photoclinic"} 연결됨</span>
          ) : (
            <a href="/api/instagram/connect" style={{ ...button, textDecoration: "none", background: C.orange }}><Instagram size={14} /> Instagram 연결</a>
          )}
          <button type="button" style={button} onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
            <Upload size={14} /> 레퍼런스 등록
          </button>
          <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadReference(file);
          }} />
        </div>
      </div>

      {message ? <div role="status" style={{ padding: "10px 13px", borderRadius: R.md, background: C.mint, color: C.teal, fontSize: 11, fontWeight: 700 }}>{message}</div> : null}

      <div style={{ ...panel, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <strong style={{ color: C.teal, fontSize: 13 }}>레이아웃 에셋</strong>
          <span style={{ color: C.hint, fontSize: 10 }}>{selectedLayouts.length}/3 선택 · 전체 {layouts.length}개</span>
        </div>
        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingTop: 10 }}>
          {layouts.map((layout) => {
            const isSelected = selectedLayouts.includes(layout.id);
            return (
            <button
              key={layout.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedLayouts((current) => {
                if (current.includes(layout.id)) return current.filter((id) => id !== layout.id);
                if (current.length >= 3) {
                  setMessage("레이아웃은 한 번에 최대 3개까지 선택할 수 있습니다.");
                  return current;
                }
                setMessage("");
                return [...current, layout.id];
              })}
              style={{
                minWidth: 150,
                textAlign: "left",
                border: `2px solid ${isSelected ? C.orange : C.border}`,
                borderRadius: R.md,
                padding: 10,
                background: isSelected ? C.mint : C.surface,
                fontFamily: "var(--font-sans)",
                cursor: "pointer",
              }}
            >
              <ImagePlus size={15} color={layout.asset_type === "reference" ? C.orange : C.sage} />
              <div style={{ marginTop: 6, color: C.ink, fontSize: 10.5, fontWeight: 700 }}>{layout.name}</div>
              <div style={{ marginTop: 2, color: isSelected ? C.teal : C.hint, fontSize: 9 }}>
                {isSelected ? "시안 생성에 사용" : layout.asset_type === "reference" ? "레퍼런스" : "기본 레이아웃"}
              </div>
            </button>
          )})}
        </div>
      </div>

      {contents.length === 0 ? (
        <div style={{ ...panel, color: C.muted, fontSize: 11, textAlign: "center", padding: 28 }}>
          리뷰를 선택해 인스타 콘텐츠를 생성하면 여기에 시안이 표시됩니다.
        </div>
      ) : contents.slice(0, 6).map((content) => {
        const variants = content.review_content_variants || [];
        const hospital = content.client_reviews?.clients?.hospital_name || content.client_reviews?.clients?.name || "고객";
        const selected = selectedVariants[content.id] || content.selected_variant_id || "";
        return (
          <article key={content.id} style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <span style={{ color: C.orange, fontSize: 9, fontWeight: 700 }}>{content.status.toUpperCase()}</span>
                <h3 style={{ margin: "4px 0 0", color: C.ink, fontSize: 14, fontWeight: 700 }}>{hospital} 리뷰 콘텐츠</h3>
                <p style={{ margin: "4px 0 0", color: C.muted, fontSize: 10.5, lineHeight: 1.5 }}>{content.summary}</p>
              </div>
              {!variants.length ? (
                <button type="button" style={button} onClick={() => void createVariants(content.id)} disabled={Boolean(busy) || !selectedLayouts.length}>
                  {busy === `variants:${content.id}` ? <RefreshCw size={13} /> : <Sparkles size={13} />} 시안 3개 만들기
                </button>
              ) : null}
            </div>

            {variants.length ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 9, marginTop: 14 }}>
                  {variants.map((variant) => (
                    <button key={variant.id} type="button" onClick={() => setSelectedVariants((value) => ({ ...value, [content.id]: variant.id }))} style={{
                      position: "relative", overflow: "hidden", padding: 0, borderRadius: R.lg,
                      border: `3px solid ${selected === variant.id ? C.orange : "transparent"}`,
                      background: C.mint, cursor: "pointer",
                    }}>
                      {variant.imageUrl ? <img src={variant.imageUrl} alt={`${hospital} 리뷰 콘텐츠 시안`} style={{ display: "block", width: "100%", aspectRatio: "4/5", objectFit: "cover" }} /> : null}
                      {selected === variant.id ? <span style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", background: C.orange, color: C.white }}><Check size={14} /></span> : null}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
                  {content.status !== "published" && content.status !== "approved" ? (
                    <button type="button" style={button} onClick={() => void approve(content.id)} disabled={Boolean(busy)}><Check size={13} /> 선택 시안 승인</button>
                  ) : null}
                  {content.status === "approved" ? (
                    <button type="button" style={{ ...button, background: C.orange }} onClick={() => void publish(content.id)} disabled={Boolean(busy)}><Send size={13} /> Instagram 게시</button>
                  ) : null}
                  {content.status === "published" ? <span style={{ ...button, background: C.mint, color: C.success, cursor: "default" }}><Check size={13} /> 게시 완료</span> : null}
                </div>
              </>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
