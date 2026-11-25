import { CONTRACT_BRAND_CONFIG } from "@/lib/contract/contractDocument";
import { DOCUMENT_BRAND_COLORS, DOCUMENT_SUPPLIER } from "@/lib/contract/documentBrandStyle";
import type { TransactionStatement } from "./transactionStatementStore";

type StatementAssets = { logo: string; signature: string; seal?: string; koreanFont?: string };

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const html = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
const money = (value: number) => value.toLocaleString("ko-KR");

function koreanWon(value: number): string {
  const digits = "영일이삼사오육칠팔구";
  const groups = ["", "만", "억", "조", "경"];
  let remaining = Math.abs(Math.trunc(value));
  const parts: string[] = [];
  for (const group of groups) {
    if (!remaining) break;
    const chunk = remaining % 10_000;
    remaining = Math.floor(remaining / 10_000);
    if (!chunk) continue;
    const part = [1000, 100, 10, 1].map((place, index) => {
      const digit = Math.floor(chunk / place) % 10;
      return digit ? (digit === 1 && place > 1 ? "" : digits[digit]) + ["천", "백", "십", ""][index] : "";
    }).join("");
    parts.unshift(part + group);
  }
  return `일금 ${value < 0 ? "마이너스 " : ""}${parts.join("") || "영"}원정`;
}

export function buildStatementHtml(statement: TransactionStatement, assets: StatementAssets) {
  const { document: quote, recipient, quoteNumber, lines } = statement.snapshot;
  const brand = CONTRACT_BRAND_CONFIG[quote.brand];
  const { ink, accent } = DOCUMENT_BRAND_COLORS[quote.brand];
  const supplier = DOCUMENT_SUPPLIER;
  const taxIncluded = quote.taxMode === "included";
  const taxExcluded = quote.taxMode === "excluded";
  const itemTaxes = lines.map(({ amount }) => {
    const supply = taxIncluded ? Math.round(amount / 1.1) : amount;
    const vat = taxIncluded ? amount - supply : taxExcluded ? 0 : Math.round(supply * 0.1);
    return { supply, vat };
  });
  const adjustment = itemTaxes.reduce(
    (rest, item) => ({ supply: rest.supply - item.supply, vat: rest.vat - item.vat }),
    { supply: quote.supplyAmount, vat: quote.vat },
  );
  const row = (label: string, value: string, className = "") =>
    `<div class="row ${className}"><span>${html(label)}</span><b>${html(value || "—")}</b></div>`;
  const amount = (label: string, value: number, className?: string) => row(label, money(value), className);
  const taxLabel = taxExcluded ? "세액 (부가세 제외)" : taxIncluded ? "세액 (10% 포함)" : "세액 (10%)";
  const shootDate = statement.shoot_date || quote.customer.shootDate;
  const confirmedTime = statement.confirmed_at
    ? new Date(statement.confirmed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" })
    : null;
  const seal = assets.seal ? `<span class="seal"><img src="${html(assets.seal)}" alt="공급자 직인"></span>` : "";
  const business = [supplier.businessCategory, supplier.businessItem].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${html(statement.statement_number)} 거래명세서</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@700&display=swap">
  <style>
    ${assets.koreanFont ? `@font-face{font-family:"Statement Korean";src:url("${assets.koreanFont}") format("truetype")}` : ""}
    @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#1c2b28;font:11px/1.52 "Noto Sans KR","Statement Korean","Apple SD Gothic Neo",sans-serif}
    main{width:793px;min-height:1120px;padding:39px 48px 32px;display:flex;flex-direction:column}
    header,.columns,.total{display:flex;justify-content:space-between;gap:18px}
    header{border-top:6px solid ${ink};border-bottom:2px solid ${ink};padding:20px 0 14px;margin-bottom:16px;align-items:center}
    header img{width:112px;max-height:86px;object-fit:contain;object-position:left center}
    header .metadata{text-align:right;color:#587673}header .metadata b{color:${accent}}
    h1{font:700 31px/1.3 "Noto Serif KR","Statement Korean",serif;letter-spacing:.26em;margin:0 0 8px;color:#1c2b28}
    section{flex:1;min-width:0;position:relative;border-top:2px solid ${ink};padding-top:8px}
    .parties section:nth-child(2){border-color:${accent}}h2{font-size:11px;color:${ink};margin:0 0 7px}
    .parties section:nth-child(2) h2{color:${accent}}
    .row{display:grid;grid-template-columns:69px 1fr;gap:6px;padding:3px 0;border-bottom:1px solid #e7efed}
    .row span,small{color:#587673}.row b{overflow-wrap:anywhere}
    .total{margin:14px 0;padding:13px 16px;background:#eff6f5;border:1px solid #c8ddd9;border-radius:7px;align-items:center;color:${ink}}
    .total strong{font-size:18px}.total .words{font:700 14px "Noto Serif KR","Statement Korean",serif;color:#1c2b28}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:${ink};color:white;text-align:left;text-wrap:nowrap}
    th,td{padding:6px 7px;border-bottom:1px solid #e7efed}tr{break-inside:avoid}.numeric{text-align:right;white-space:nowrap}
    td small{white-space:pre-line;overflow-wrap:anywhere}.adjustment{color:#587673}
    .notes{flex:1.4}.notes p{color:#587673}.bank{margin-top:10px;padding:8px 10px;border:1px solid #c8ddd9;border-radius:7px;background:#f7faf9}
    .payment .row{grid-template-columns:1fr auto}.payment .sum{border-top:2px solid ${accent};color:${ink};font-size:14px}
    .payment .balance{color:${accent};font-size:13px}.payment .sum span,.payment .balance span{color:inherit;font-weight:600}
    footer{margin-top:auto;padding-top:20px}footer section{border:1px solid #c8ddd9;border-radius:7px;padding:10px 12px}
    footer h2{border-bottom:1px solid #e7efed;padding-bottom:4px}
    .seal{position:absolute;right:12px;width:52px;height:52px;overflow:hidden;transform:rotate(0deg);mix-blend-mode:multiply}
    .seal img{position:absolute;width:70px;max-width:none;height:auto;left:-9px;top:-4.5px}
    .parties .seal{top:61px}.sign .seal{top:33px}.signature{width:105px;height:35px;object-fit:contain;object-position:left center}
    .with-seal .row b{padding-right:58px}.receipt{border-radius:999px;background:#e9f4f1;color:${ink};padding:2px 9px;display:inline-block;font-weight:700}
    p{margin:3px 0}.tagline{margin-top:10px;text-align:center;color:#688983;font-size:9px}
    main[data-fit="compact"]{padding:28px 42px 25px;font-size:10px;line-height:1.35}
    main[data-fit="compact"] header{margin-bottom:10px;padding:12px 0 9px}
    main[data-fit="compact"] header img{max-height:62px}
    main[data-fit="compact"] .row{padding:2px 0}
    main[data-fit="compact"] .total{margin:9px 0;padding:8px 12px}
    main[data-fit="compact"] th,main[data-fit="compact"] td{padding:2px 5px}
    main[data-fit="compact"] td br{display:none}
    main[data-fit="compact"] td small{margin-left:5px;white-space:normal}
    main[data-fit="compact"] footer{padding-top:11px}
    main[data-fit="compact"] .parties .seal{top:49px}
  </style></head><body><main class="statement-sheet">
  <header><div><img src="${html(assets.logo)}" alt="${html(brand.logoAlt)}"><p><small>${html(brand.brandSub)}</small></p></div>
  <div class="metadata"><h1>거래명세서</h1><p>명세서번호 <b>${html(statement.statement_number)}</b></p>
  <p>거래일 ${html(statement.transaction_date)}${shootDate ? ` · 촬영일 ${html(shootDate)}` : ""}</p>
  <p>근거 견적서 ${html(quoteNumber)}</p></div></header>
  <div class="columns parties"><section class="${seal ? "with-seal" : ""}"><h2>공급자</h2>${row("상호", brand.companyDisplayName)}
  ${row("사업자번호", supplier.businessNumber)}${row("대표자", supplier.representative)}${seal}
  ${row("주소", supplier.address)}${business ? row("업태·종목", business) : ""}${row("연락처", supplier.phone)}</section>
  <section><h2>공급받는자</h2>${row(brand.entityLabel, quote.customer.hospitalName)}${row("사업자번호", recipient.businessNumber)}
  ${row("대표자", recipient.representative)}${row("주소", recipient.address)}${row("담당자", quote.customer.managerName)}${row("이메일", quote.customer.email)}</section></div>
  <div class="total"><div><b>합계금액</b><br><small>공급가액 + 세액</small></div><span class="words">${koreanWon(quote.finalAmount)}</span><strong>₩${money(quote.finalAmount)}</strong></div>
  <table><thead><tr><th>No</th><th>품목 / 내용</th><th class="numeric">수량</th><th class="numeric">단가</th><th class="numeric">공급가액</th><th class="numeric">세액</th><th>비고</th></tr></thead><tbody>
  ${lines.map((item, index) => {
    const tax = itemTaxes[index];
    return `<tr><td>${index + 1}</td><td>${html(item.name)}${item.detail ? `<br><small>${html(item.detail)}</small>` : ""}</td>
      <td class="numeric">${money(item.quantity)}</td><td class="numeric">${money(item.unitPrice)}</td>
      <td class="numeric">${money(tax.supply)}</td><td class="numeric">${money(tax.vat)}</td><td>${html(item.note)}</td></tr>`;
  }).join("")}
  ${adjustment.supply || adjustment.vat ? `<tr class="adjustment"><td></td><td colspan="3">견적 조정 및 세액 차이</td>
    <td class="numeric">${money(adjustment.supply)}</td><td class="numeric">${money(adjustment.vat)}</td><td></td></tr>` : ""}
  </tbody></table>
  <div class="columns"><section class="notes"><h2>비고</h2><p>본 거래명세서는 견적서 ${html(quoteNumber)}의 내용을 그대로 옮겨 작성되었습니다. 세금계산서는 별도로 발행됩니다.</p>
  ${taxIncluded ? "<p>표에 적힌 단가는 부가세를 포함합니다.</p>" : ""}
  <div class="bank"><b>입금계좌</b> ${supplier.bank} ${supplier.account} (${supplier.accountHolder})</div></section>
  <section class="payment">${quote.discountTotal ? amount(quote.discountLabel || "할인", -quote.discountTotal) : ""}
  ${quote.specialAdjustmentAmount ? amount("특별조정", quote.specialAdjustmentAmount) : ""}
  ${quote.roundDownAmount ? amount("절삭", -quote.roundDownAmount) : ""}
  ${amount("공급가액", quote.supplyAmount)}${amount(taxLabel, quote.vat)}${amount("합계", quote.finalAmount, "sum")}
  ${amount(`선금 ${quote.depositRate}%`, quote.depositAmount)}${amount(`잔금 ${100 - quote.depositRate}%`, quote.balanceAmount, "balance")}</section></div>
  <footer class="columns"><section class="sign"><h2>공급자</h2><p>${html(brand.companyDisplayName)}<br>대표 ${supplier.representative}</p>
  <img class="signature" src="${html(assets.signature)}" alt="대표 서명">${seal}</section>
  <section><h2>공급받는자 수신확인</h2>${confirmedTime
    ? `<p class="receipt">✓ 포털에서 확인됨</p><p>${html(confirmedTime)} · ${html(statement.confirmed_by)}</p>`
    : "<p>확인 대기</p>"}</section></footer>
  <p class="tagline">${html(brand.footerTagline)}</p></main></body></html>`;
}
