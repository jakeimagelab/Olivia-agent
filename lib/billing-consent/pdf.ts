import type { Browser } from "playwright-core";
import type { BillingConsentRow } from "./server";

async function launchBrowser(): Promise<Browser> {
  const { chromium: playwrightChromium } = await import("playwright-core");
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return playwrightChromium.launch({ headless: true });
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function won(value: unknown) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

function kstDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export type BillingConsentPdfInput = {
  consent: BillingConsentRow;
  signatureDataUrl?: string | null;
  evidenceImages?: Array<{ label: string; dataUrl: string }>;
  preview?: boolean;
};

export function buildBillingConsentPdfHtml(input: BillingConsentPdfInput) {
  const consent = input.consent;
  const customer = consent.customer_snapshot ?? {};
  const issuer = consent.issuer_snapshot ?? {};
  const items = Array.isArray(consent.items) ? consent.items : [];
  const clauses = (Array.isArray(consent.evidence) ? consent.evidence : [])
    .filter((item) => item.kind === "clause" && item.text);
  const checks = consent.consent_checks ?? {};
  const recordPage = !input.preview && consent.signed_at;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page { size:A4; margin:14mm 14mm 16mm; }
    * { box-sizing:border-box; }
    body { margin:0; color:#1B2B28; font-family:"Apple SD Gothic Neo","Noto Sans KR",sans-serif; font-size:11px; line-height:1.65; }
    h1,h2,p { margin:0; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #155855; padding-bottom:14px; margin-bottom:18px; }
    .header h1 { font-size:24px; font-weight:600; }
    .eyebrow { color:#155855; font-size:9px; letter-spacing:1.5px; }
    .doc { text-align:right; color:#5D726E; }
    .section { margin:18px 0; break-inside:avoid; }
    .section h2 { font-size:13px; font-weight:600; margin-bottom:8px; color:#155855; }
    .info { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; padding:13px 14px; background:#F3F7F5; border:1px solid #D8E4E1; border-radius:8px; }
    .info div { display:flex; gap:8px; }
    .info span { color:#71837F; min-width:64px; }
    table { width:100%; border-collapse:collapse; }
    th,td { padding:9px 8px; border-bottom:1px solid #DCE5E3; text-align:right; }
    th:first-child,td:first-child { text-align:left; }
    th { background:#F3F7F5; color:#536B66; font-weight:600; }
    .totals { margin-left:auto; width:280px; padding-top:8px; }
    .totals div { display:flex; justify-content:space-between; padding:5px 0; }
    .totals .grand { font-size:16px; font-weight:600; border-top:2px solid #155855; margin-top:4px; padding-top:9px; }
    .reason,.clause { border:1px solid #D8E4E1; border-radius:8px; padding:12px 14px; white-space:pre-wrap; }
    .evidence { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .evidence figure { margin:0; break-inside:avoid; }
    .evidence img { width:100%; max-height:230px; object-fit:contain; border:1px solid #D8E4E1; }
    .evidence figcaption { color:#71837F; margin-top:4px; }
    .agree { margin-top:22px; padding:14px; border:1px solid #155855; border-radius:8px; }
    .signature { margin-top:14px; display:grid; grid-template-columns:1fr 220px; gap:16px; align-items:end; }
    .signature img { width:220px; height:90px; object-fit:contain; border-bottom:1px solid #9BADAA; }
    .footer { position:fixed; left:0; right:0; bottom:-8mm; color:#82928F; font-size:8px; display:flex; justify-content:space-between; }
    .record { page-break-before:always; }
    .record-grid { display:grid; grid-template-columns:150px 1fr; border-top:1px solid #D8E4E1; }
    .record-grid dt,.record-grid dd { margin:0; padding:10px; border-bottom:1px solid #D8E4E1; }
    .record-grid dt { color:#607570; background:#F3F7F5; }
    .hash { word-break:break-all; font-family:ui-monospace,SFMono-Regular,monospace; font-size:9px; }
    .preview { color:#C94A1E; font-weight:600; }
  </style></head><body>
    <div class="footer"><span>${escapeHtml(consent.document_id)}</span><span>문서 증거 SHA-256 · ${escapeHtml(consent.document_evidence_sha256 || (input.preview ? "미리보기 — 서명 시 생성" : ""))}</span></div>
    <header class="header"><div><div class="eyebrow">BILLING CONSENT</div><h1>비용 청구 동의서</h1>${input.preview ? '<p class="preview">미리보기</p>' : ""}</div><div class="doc">문서 ID<br><strong>${escapeHtml(consent.document_id)}</strong></div></header>
    <section class="section info">
      <div><span>청구 업체</span><strong>${escapeHtml(issuer.companyName || "포토클리닉")}</strong></div>
      <div><span>고객</span><strong>${escapeHtml(customer.name || "고객")}</strong></div>
      <div><span>담당자</span><strong>${escapeHtml(customer.contactName || "—")}</strong></div>
      <div><span>입금 기한</span><strong>${escapeHtml(consent.due_date || "별도 협의")}</strong></div>
    </section>
    <section class="section"><h2>청구 항목</h2><table><thead><tr><th>항목</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>
      ${items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${won(item.unitPrice)}</td><td>${won(item.amount)}</td></tr>`).join("")}
    </tbody></table><div class="totals"><div><span>공급가액</span><strong>${won(consent.subtotal)}</strong></div><div><span>부가세 10%</span><strong>${won(consent.vat)}</strong></div><div class="grand"><span>합계</span><strong>${won(consent.total)}</strong></div></div></section>
    <section class="section"><h2>청구 사유</h2><div class="reason">${escapeHtml(consent.reason || "추가 작업 비용")}</div></section>
    ${clauses.length ? `<section class="section"><h2>근거 조항</h2>${clauses.map((item) => `<div class="clause"><strong>${escapeHtml(item.label || "근거")}</strong><br>${escapeHtml(item.text)}</div>`).join("<br>")}</section>` : ""}
    ${input.evidenceImages?.length ? `<section class="section"><h2>첨부 근거</h2><div class="evidence">${input.evidenceImages.map((image) => `<figure><img src="${image.dataUrl}" alt=""><figcaption>${escapeHtml(image.label)}</figcaption></figure>`).join("")}</div></section>` : ""}
    <section class="section"><h2>입금 정보</h2><div class="reason">${escapeHtml(consent.bank_info || "별도 안내")}</div></section>
    <section class="agree"><p>본인은 위 청구 내용을 확인했으며, 위 금액을 지급하는 데 동의합니다.</p>
      ${recordPage ? `<div class="signature"><div><p>서명자 <strong>${escapeHtml(consent.signer_name)}</strong></p><p>동의 시각 ${escapeHtml(kstDateTime(consent.signed_at))}</p></div>${input.signatureDataUrl ? `<img src="${input.signatureDataUrl}" alt="서명">` : ""}</div>` : ""}
    </section>
    ${recordPage ? `<section class="record"><header class="header"><div><div class="eyebrow">SIGNATURE RECORD</div><h1>서명 기록</h1></div><div class="doc">문서 ID<br><strong>${escapeHtml(consent.document_id)}</strong></div></header>
      <dl class="record-grid"><dt>서명자</dt><dd>${escapeHtml(consent.signer_name)}</dd><dt>인증 연락처</dt><dd>${escapeHtml(consent.verification_target_masked)}</dd><dt>동의 시각</dt><dd>${escapeHtml(kstDateTime(consent.signed_at))} KST</dd><dt>IP</dt><dd>${escapeHtml(consent.signed_ip)}</dd><dt>기기·브라우저</dt><dd>${escapeHtml(consent.signed_ua)}</dd><dt>청구 내용 확인</dt><dd>${checks.confirmedContent === true ? "동의" : "—"}</dd><dt>지급 동의</dt><dd>${checks.agreedToPay === true ? "동의" : "—"}</dd><dt>문서 증거 SHA-256</dt><dd class="hash">${escapeHtml(consent.document_evidence_sha256)}</dd></dl>
      <p style="margin-top:18px;color:#657A76">이 기록은 고객 본인 확인 후 제출된 동의와 서명 정보를 서버가 고정한 것입니다. PDF 파일 위변조 여부는 문서 ID를 사용해 검증할 수 있습니다.</p>
    </section>` : ""}
  </body></html>`;
}

export async function renderBillingConsentPdf(input: BillingConsentPdfInput) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(buildBillingConsentPdfHtml(input), { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }));
    });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
