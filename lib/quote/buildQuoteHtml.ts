import { BRAND_CONFIG } from "@/lib/quote/quoteCatalog";
import type { Brand } from "@/lib/quote/quoteFormTypes";

// ContractBuilder.tsx의 buildContractHtml() 패턴을 그대로 따른다(외부 CSS 의존 없음, 전부
// <style> 블록 내부, 이미지는 <base href>로 절대경로 resolve) — headless 브라우저(Playwright)로
// page.setContent(html) 후 screenshot/pdf를 그대로 뜰 수 있는 형태를 유지하기 위해서다.
// QuoteBuilder.tsx의 클라이언트 미리보기(JSX+html2canvas)와는 별도 렌더러지만, 값 자체는 전부
// quotes 테이블에 이미 저장된 실제 값만 쓰고 여기서 새로 계산하지 않는다.

const fmt = (n: unknown) => (Number(n) || 0).toLocaleString("ko-KR");

type QuoteItemRow = {
  id?: string;
  name?: string;
  detail?: string;
  note?: string;
  qty?: number;
  unitPrice?: number;
  subtotal?: number;
};

function resolveBrand(quote: Record<string, unknown>): Brand {
  const formState = quote.form_state && typeof quote.form_state === "object"
    ? quote.form_state as Record<string, unknown>
    : {};
  return formState.brand === "jakeimage" ? "jakeimage" : "photoclinic";
}

export function buildQuoteHtml(quote: Record<string, unknown>, opts: { baseUrl?: string } = {}): string {
  const brand = resolveBrand(quote);
  const cfg = BRAND_CONFIG[brand];
  const ink = brand === "jakeimage" ? "#162238" : "#155855";
  const accent = brand === "jakeimage" ? "#2f4a73" : "#E85D2C";
  const tint = brand === "jakeimage" ? "#EEF2F7" : "#FFF6F1";
  const tintBorder = brand === "jakeimage" ? "#CDDAEA" : "#F3C6B1";
  const baseHref = opts.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000";

  const items = Array.isArray(quote.items) ? quote.items as QuoteItemRow[] : [];
  const itemRows = items.map((item, i) => `
    <div class="quote-item">
      <div class="item-index">${String(i + 1).padStart(2, "0")}</div>
      <div class="item-main">
        <strong>${item.name || ""}</strong>
        ${item.detail ? `<span>${item.detail}</span>` : ""}
        ${item.note ? `<em>${item.note}</em>` : ""}
      </div>
      <div class="item-amount">
        <small>수량 ${item.qty ?? 1}</small>
        <b>${fmt(item.subtotal)}원</b>
      </div>
    </div>`).join("");

  const discountAmount = Number(quote.discount_amount) || 0;
  const memos = typeof quote.memos === "string" ? quote.memos.trim() : "";
  const quoteNumber = typeof quote.quote_number === "string" && quote.quote_number
    ? quote.quote_number
    : `${cfg.quoteNumberPrefix}${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const quoteDate = typeof quote.quote_date === "string" && quote.quote_date ? quote.quote_date : "";
  const validUntil = typeof quote.valid_until === "string" && quote.valid_until ? quote.valid_until : "";
  const title = typeof quote.title === "string" && quote.title ? quote.title : cfg.defaultQuoteTitle;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<base href="${baseHref}/">
<title>${title} · ${quote.hospital_name || ""}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Noto Sans KR',sans-serif;color:#1C2B28;background:#F3F8F7;
       padding:18px 0;font-size:10.8px;line-height:1.55;margin:0;}
  .quote-page{width:794px;height:1123px;margin:0 auto;padding:42px 56px;
              background:#fff;overflow:hidden;position:relative;}
  .top-accent{height:6px;background:${accent};border-radius:99px;margin-bottom:18px;}
  .header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:start;
          margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid ${ink};}
  .brand-logo{width:126px;height:auto;display:block;margin-bottom:8px;}
  .brand-sub{font-size:8.8px;color:#6B8B87;margin-top:2px;line-height:1.45;white-space:nowrap;}
  .doc-title{font-size:20px;font-weight:700;color:#1C2B28;letter-spacing:.3px;text-align:right;white-space:nowrap;}
  .doc-meta{font-size:10px;color:#6B8B87;text-align:right;margin-top:6px;line-height:1.55;}
  .doc-meta strong{color:${accent};}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;}
  .party{border-top:3px solid ${ink};padding:9px 0 0;background:#fff;}
  .party.party-client{border-top-color:${accent};}
  .party h3{font-size:10px;font-weight:700;color:${ink};letter-spacing:.02em;margin-bottom:7px;}
  .party.party-client h3{color:${accent};}
  .party .row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:9px;padding:3px 0;font-size:10.4px;border-bottom:1px solid #EEF4F3;}
  .party .k{color:#6B8B87;}
  .party .v{font-weight:600;color:#1C2B28;word-break:keep-all;overflow-wrap:break-word;line-height:1.45;}
  .section-title{font-size:10.6px;font-weight:700;color:${ink};margin-bottom:7px;
              padding-bottom:5px;border-bottom:1px solid #C8DDD9;}
  .quote-list{display:grid;gap:3px;margin-bottom:10px;}
  .quote-item{display:grid;grid-template-columns:36px minmax(0,1fr) 132px;gap:12px;align-items:start;
              padding:7px 0;border-bottom:1px solid #E4F0EE;}
  .item-index{font-size:10px;font-weight:700;color:${accent};}
  .item-main strong{display:block;font-size:11px;color:#1C2B28;margin-bottom:1px;word-break:keep-all;overflow-wrap:break-word;}
  .item-main span{display:block;font-size:9.4px;color:#6B8B87;line-height:1.4;word-break:keep-all;overflow-wrap:break-word;}
  .item-main em{display:inline-block;margin-top:4px;font-style:normal;font-size:9px;color:#fff;
                background:${ink};border-radius:99px;padding:1px 7px;}
  .item-amount{text-align:right;}
  .item-amount small{display:block;font-size:9px;color:#9BB5B0;margin-bottom:2px;}
  .item-amount b{font-size:11px;color:${ink};}
  .amount-panel{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px;align-items:end;
                border-top:2px solid ${ink};padding-top:10px;margin-bottom:18px;}
  .amount-note{font-size:9.2px;color:#6B8B87;line-height:1.5;word-break:keep-all;}
  .amt-row{display:flex;justify-content:space-between;padding:2px 0;font-size:10px;
           border-bottom:.5px solid #EEF4F3;}
  .amt-row .l{color:#6B8B87;}
  .amt-total{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;
             font-weight:700;color:${ink};border-top:2px solid ${accent};margin-top:2px;}
  .pay-boxes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;}
  .pay-box{border:1px solid #C8DDD9;border-radius:7px;padding:10px;text-align:center;background:#FAFCFC;}
  .pay-box .pt{font-size:10px;color:#9BB5B0;margin-bottom:3px;}
  .pay-box .pa{font-size:15px;font-weight:700;color:${ink};}
  .pay-box:first-child .pa{color:${accent};}
  .memo-box{background:${tint};border:1px solid ${tintBorder};border-radius:8px;
            padding:12px 14px;margin-bottom:16px;font-size:10px;color:#2C3E3D;line-height:1.6;
            white-space:pre-line;word-break:keep-all;}
  .effect-box{background:${tint};border:1px solid ${tintBorder};border-radius:7px;
              padding:9px 10px;font-size:9.4px;color:#2C3E3D;line-height:1.6;text-align:center;}
  .footer{margin-top:14px;text-align:center;font-size:9px;color:#9BB5B0;
          padding-top:8px;border-top:1px solid #EEF4F3;}
  @media print{
    body{padding:0;background:#fff;}
    .quote-page{margin:0;box-shadow:none;}
    @page{size:A4;margin:0;}
  }
</style>
</head>
<body>
<div class="quote-page">
<div class="top-accent"></div>
<div class="header">
  <div>
    <img class="brand-logo" src="${cfg.logo}" alt="${cfg.label}">
    <div class="brand-sub">${cfg.brandMarkCaption}</div>
    <div class="brand-sub">사업자번호: 190-16-00212 · 제이크이미지연구소</div>
  </div>
  <div>
    <div class="doc-title">${title}</div>
    <div class="doc-meta">
      <strong>견적번호: ${quoteNumber}</strong><br>
      견적일: ${quoteDate || "-"} · 유효기간: ${validUntil || "-"}
    </div>
  </div>
</div>

<div class="parties">
  <div class="party party-client">
    <h3>고객 정보</h3>
    <div class="row"><span class="k">${cfg.entityLabel}</span><span class="v">${quote.hospital_name || "-"}</span></div>
    <div class="row"><span class="k">담당자</span><span class="v">${quote.contact_name || "-"}</span></div>
    <div class="row"><span class="k">연락처</span><span class="v">${quote.phone || "-"}</span></div>
    <div class="row"><span class="k">이메일</span><span class="v">${quote.email || "-"}</span></div>
    <div class="row"><span class="k">촬영예정일</span><span class="v">${quote.shoot_date || "상호 협의"}</span></div>
  </div>
  <div class="party">
    <h3>${cfg.label}</h3>
    <div class="row"><span class="k">상호</span><span class="v">제이크이미지연구소</span></div>
    <div class="row"><span class="k">대표자</span><span class="v">정연호</span></div>
    <div class="row"><span class="k">사업자번호</span><span class="v">190-16-00212</span></div>
    <div class="row"><span class="k">연락처</span><span class="v">010-8556-2988</span></div>
    <div class="row"><span class="k">계좌</span><span class="v">1002-754-988962 (우리은행)</span></div>
  </div>
</div>

<div class="section-title">촬영 항목</div>
<div class="quote-list">${itemRows}</div>

<div class="amount-panel">
  <p class="amount-note">
    상기 금액은 부가세 별도 산정 기준이며, 촬영 범위 또는 납품 범위가 변경되는 경우 상호 협의에 따라 조정될 수 있습니다.
  </p>
  <div class="amt-box">
    <div class="amt-row"><span class="l">공급가액</span><span>${fmt(quote.supply_amount)}원</span></div>
    ${discountAmount > 0 ? `<div class="amt-row"><span class="l">할인금액</span><span style="color:${accent};">-${fmt(discountAmount)}원</span></div>` : ""}
    <div class="amt-row"><span class="l">부가세 (10%)</span><span>${fmt(quote.vat)}원</span></div>
    <div class="amt-total"><span>최종 견적금액</span><span>${fmt(quote.total_amount)}원</span></div>
  </div>
</div>

<div class="pay-boxes">
  <div class="pay-box">
    <div class="pt">계약금 (선금 ${Number(quote.deposit_rate) || 50}%)</div>
    <div class="pa">${fmt(quote.deposit_amount)}원</div>
  </div>
  <div class="pay-box">
    <div class="pt">잔금 (${100 - (Number(quote.deposit_rate) || 50)}%)</div>
    <div class="pa">${fmt(quote.balance_amount)}원</div>
  </div>
</div>

${memos ? `<div class="memo-box">【메모】 ${memos}</div>` : ""}

<div class="effect-box">본 견적서의 유효기간은 ${validUntil || "발행일로부터 14일"}까지이며, 이후에는 재문의가 필요합니다.</div>

<div class="footer">${cfg.label} · ${cfg.brandMarkCaption}</div>
</div>
</body>
</html>`;
}
