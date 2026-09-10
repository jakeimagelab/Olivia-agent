"use client";

import { useEffect, useRef, useState } from "react";

export type PreviewQuoteItem = {
  id?: string;
  name?: string;
  detail?: string;
  note?: string;
  qty?: number;
  unitPrice?: number;
  subtotal?: number;
};

export type PreviewQuote = {
  quoteNumber: string;
  title: string;
  hospitalName: string;
  quoteDate: string;
  shootDate: string;
  validUntil: string;
  items: PreviewQuoteItem[];
  supplyAmount: number;
  discountAmount: number;
  vat: number;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  depositRate: number;
  memos: string;
  status: string;
  brand: "photoclinic" | "jakeimage";
  updatedAt: string;
};

const INK = "#155855";
const ACCENT = "#E85D2C";
const IVORY = "#FAF7F2";
const POLL_MS = 4000;

const won = (n: unknown) => `${(Number(n) || 0).toLocaleString("ko-KR")}원`;

const BRAND_NAME: Record<PreviewQuote["brand"], string> = {
  photoclinic: "포토클리닉",
  jakeimage: "제이크이미지연구소",
};

function StatusBadge({ status }: { status: string }) {
  const published = status === "published";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: published ? "rgba(21,88,85,0.12)" : "rgba(0,0,0,0.06)",
        color: published ? INK : "#666",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: published ? INK : "#999",
        }}
      />
      {published ? "발행 완료" : "작성 중"}
    </span>
  );
}

export default function QuotePreviewMobile({ token, initialQuote }: { token: string; initialQuote: PreviewQuote }) {
  const [quote, setQuote] = useState(initialQuote);
  const [connected, setConnected] = useState(true);
  const quoteRef = useRef(quote);
  quoteRef.current = quote;

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/quotes/preview/${token}`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && body?.ok && body.quote) {
          setConnected(true);
          if (body.quote.updatedAt !== quoteRef.current.updatedAt) setQuote(body.quote);
        } else {
          setConnected(false);
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  return (
    <div style={{ background: IVORY, minHeight: "100vh", fontFamily: "'Pretendard', sans-serif" }}>
      <div
        style={{
          background: INK,
          padding: "16px 18px",
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: "0 2px 12px rgba(21,88,85,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>
            {BRAND_NAME[quote.brand]} 견적서
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              color: connected ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)",
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: connected ? "#8FE3B0" : "#999",
              }}
            />
            {connected ? "실시간 연결됨" : "연결 확인 중"}
          </div>
        </div>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 19, marginTop: 6 }}>
          {quote.hospitalName || "고객"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <StatusBadge status={quote.status} />
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{quote.quoteNumber}</span>
        </div>
      </div>

      <div style={{ padding: "16px 14px", maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            ["견적일", quote.quoteDate],
            ["촬영일", quote.shootDate],
            ["유효기간", quote.validUntil],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div
                key={label}
                style={{
                  background: "#fff",
                  border: "1px solid rgba(21,88,85,0.12)",
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                <div style={{ fontSize: 10, color: "#999", fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 13, color: "#333", fontWeight: 700, marginTop: 2 }}>{value}</div>
              </div>
            ))}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: INK, marginBottom: 8, letterSpacing: "0.02em" }}>
            견적 항목
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {quote.items.map((item, i) => (
              <div
                key={item.id || i}
                style={{
                  background: "#fff",
                  border: "1px solid rgba(21,88,85,0.1)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>{item.name}</div>
                  {item.detail && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{item.detail}</div>}
                  {item.note && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2, fontStyle: "italic" }}>{item.note}</div>}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: "#999" }}>수량 {item.qty ?? 1}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#222", marginTop: 2 }}>{won(item.subtotal)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: `1px solid rgba(21,88,85,0.15)`,
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <Row label="공급가액" value={won(quote.supplyAmount)} />
          {quote.discountAmount > 0 && <Row label="할인" value={`-${won(quote.discountAmount)}`} muted />}
          <Row label="부가세" value={won(quote.vat)} />
          <div style={{ height: 1, background: "rgba(21,88,85,0.12)", margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: INK }}>총 금액</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: ACCENT }}>{won(quote.totalAmount)}</span>
          </div>
          <div style={{ height: 1, background: "rgba(21,88,85,0.08)", margin: "8px 0" }} />
          <Row label={`계약금 (${quote.depositRate}%)`} value={won(quote.depositAmount)} muted />
          <Row label="잔금" value={won(quote.balanceAmount)} muted />
        </div>

        {quote.memos && (
          <div
            style={{
              background: "rgba(21,88,85,0.06)",
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              color: "#555",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              marginBottom: 16,
            }}
          >
            {quote.memos}
          </div>
        )}

        <div style={{ textAlign: "center", padding: "10px 0 24px", color: "#aaa", fontSize: 11 }}>
          {BRAND_NAME[quote.brand]} · 모바일 미리보기
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ fontSize: 12, color: muted ? "#999" : "#555" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: muted ? "#999" : "#333" }}>{value}</span>
    </div>
  );
}
