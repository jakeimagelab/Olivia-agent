"use client";

import { useEffect, useState } from "react";
import { Search, Quote, Languages, Megaphone, Briefcase, Globe2, Star } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { C } from "@/lib/theme";

type Category = "quote" | "business_english" | "marketing_case" | "consulting_framework" | "world_issue";

const CATEGORY_TABS: { key: Category; label: string; icon: React.ReactNode }[] = [
  { key: "quote", label: "세계 명언", icon: <Quote size={15} /> },
  { key: "business_english", label: "비즈니스 영어", icon: <Languages size={15} /> },
  { key: "marketing_case", label: "마케팅 사례", icon: <Megaphone size={15} /> },
  { key: "consulting_framework", label: "컨설팅 전략", icon: <Briefcase size={15} /> },
  { key: "world_issue", label: "세계 이슈·경제", icon: <Globe2 size={15} /> },
];

type LibraryItem = {
  id: string;
  category: Category;
  title: string;
  content: Record<string, any>;
  tags: string[];
  is_favorite: boolean;
};

function ItemBody({ category, content }: { category: Category; content: Record<string, any> }) {
  if (category === "quote") {
    return (
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: "8px 0 0" }}>
        "{content.text}" — <em style={{ fontStyle: "normal", fontWeight: 700, color: C.ink }}>{content.author}</em>
        <br />
        <span>{content.translation_ko}</span>
      </p>
    );
  }
  if (category === "business_english") {
    return (
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: "8px 0 0" }}>
        <span style={{ color: C.ink, fontWeight: 700 }}>"{content.phrase}"</span>
        <br />
        {content.translation_ko}
      </p>
    );
  }
  if (category === "marketing_case") {
    return (
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: "8px 0 0" }}>
        <strong style={{ color: C.ink }}>{content.company}</strong> · {content.campaign}
        <br />
        {content.summary}
      </p>
    );
  }
  if (category === "consulting_framework") {
    return (
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: "8px 0 0" }}>
        <strong style={{ color: C.ink }}>{content.firm}</strong>
        <br />
        {content.description}
      </p>
    );
  }
  return (
    <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: "8px 0 0" }}>
      {content.summary}
      <br />
      <span style={{ color: C.hint }}>{content.region} · {content.published_date}</span>
    </p>
  );
}

export default function LibraryPage() {
  const [category, setCategory] = useState<Category>("quote");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ category, ...(query ? { q: query } : {}) });
    fetch(`/api/library?${params}`)
      .then((r) => r.json())
      .then((json) => setItems(json.items ?? []))
      .finally(() => setLoading(false));
  }, [category, query]);

  const toggleFavorite = async (id: string, current: boolean) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, is_favorite: !current } : it)));
    await fetch(`/api/library/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: !current }),
    });
  };

  return (
    <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <PageHeader
        title="라이브러리"
        tabs={CATEGORY_TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
        activeTab={category}
        onTabChange={(key) => setCategory(key as Category)}
      />

      <div className="pc-content">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
          명언 · 비즈니스 영어 · 마케팅 사례 · 컨설팅 전략 · 세계 이슈를 모아둔 개인 지식창고입니다.
        </p>

        <div style={{ position: "relative", marginBottom: 20, maxWidth: 420 }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: 12, color: C.hint }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색 (예: 협상, 리더십, Apple)"
            style={{
              width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px 10px 38px",
              fontSize: 13, outline: "none", fontFamily: "inherit", color: C.ink, background: C.white, boxSizing: "border-box",
            }}
          />
        </div>

        {loading ? (
          <p style={{ color: C.hint, fontSize: 13 }}>불러오는 중…</p>
        ) : items.length === 0 ? (
          <p style={{ color: C.hint, fontSize: 13 }}>항목이 없습니다.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item) => (
              <div key={item.id} className="pc-card pc-card--padded">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <strong style={{ fontSize: 14, color: C.ink }}>{item.title}</strong>
                  <button
                    onClick={() => toggleFavorite(item.id, item.is_favorite)}
                    aria-label="즐겨찾기"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, flexShrink: 0 }}
                  >
                    <Star size={18} color={item.is_favorite ? C.orange : C.border} fill={item.is_favorite ? C.orange : "none"} />
                  </button>
                </div>
                <ItemBody category={item.category} content={item.content} />
                {item.tags?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {item.tags.map((t) => (
                      <span
                        key={t}
                        style={{ fontSize: 11, fontWeight: 700, color: C.teal, background: C.mint, borderRadius: 20, padding: "3px 10px" }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
