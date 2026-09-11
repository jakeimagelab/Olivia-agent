import { computeContractDeposit } from "@/lib/contract/computeContractDeposit";

export interface ContractQuoteData {
  hospitalName: string;
  contactName: string;
  businessNumber?: string;
  phone: string;
  email: string;
  quoteNumber: string;
  quoteDate: string;
  shootDate: string | null;
  validUntil: string;
  items: { name: string; detail: string; unitPrice: number; qty: number; subtotal: number; note: string }[];
  supplyAmount: number;
  discountAmount: number;
  vat: number;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  memos: string | null;
  depositRate?: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  specialTerms?: string;
}

export type ContractBrand = "photoclinic" | "jakeimage";

export const CONTRACT_BRAND_CONFIG: Record<ContractBrand, {
  label: string;
  logo: string;
  logoAlt: string;
  brandSub: string;
  docTitle: string;
  headerTitle: string;
  entityLabel: string;
  clientPartyTitle: string;
  directorLabel: string;
  companyDisplayName: string;
  footerTagline: string;
  emailPlaceholder: string;
  scopeClause: string;
  copyrightClause: string;
  confidentialClause: string;
}> = {
  photoclinic: {
    label: "포토클리닉",
    logo: "/assets/photoclinic-logo.png",
    logoAlt: "PHOTOCLINIC",
    brandSub: "제이크이미지연구소 · 병원 전문 브랜드 촬영",
    docTitle: "포토클리닉 브랜드촬영 계약서",
    headerTitle: "브랜드촬영 계약서",
    entityLabel: "병원명",
    clientPartyTitle: "계약 병원",
    directorLabel: "대표원장",
    companyDisplayName: "포토클리닉(제이크이미지연구소)",
    footerTagline: "PHOTOCLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영 · @photoclinic_kr",
    emailPlaceholder: "photoclnic@gmail.com",
    scopeClause: "포토클리닉은 병원 이미지브랜드 구축을 위한,\n전문 촬영 서비스(사진/영상)을 제공합니다.\n촬영 범위는 본 계약서 제2조의 항목에 한합니다.\n납품 결과물은 색보정 완료 JPG와 원본 파일을 제공합니다.\n영상 작업이 포함된 경우 편집 완료 영상(4K, FHD)을 파일로 제공합니다.\n촬영 항목 외 추가 촬영 시 별도 견적을 협의합니다.",
    copyrightClause: "촬영 결과물의 저작권은 계약 병원에 귀속됩니다.\n포토클리닉은 결과물을 포트폴리오, 홍보 및 마케팅 목적으로 사용할 수 있습니다.\n단, 민감한 의료정보나 얼굴 노출이 있는 부분은 병원의 동의 없이는 사용하지 않습니다.",
    confidentialClause: "포토클리닉은 촬영 과정에서 취득한 계약 병원의 내부 정보를\n외부에 공개하지 않습니다.\n내부 정보에는 환자 정보, 경영 정보 등이 포함됩니다.\n결과물은 계약 병원의 승인 전 SNS 등 외부 채널에 공개하지 않습니다.\n계약 병원의 승인 후 포토클리닉의 포트폴리오 채널에 게시될 수 있습니다.\n포트폴리오 채널에는 홈페이지, 인스타그램, 블로그 등이 포함됩니다.",
  },
  jakeimage: {
    label: "제이크이미지연구소",
    logo: "/assets/jakeimage-logo.png",
    logoAlt: "Jake Image Institute",
    brandSub: "Jake Image Institute · Brand Image Direction",
    docTitle: "제이크이미지연구소 브랜드사진 계약서",
    headerTitle: "브랜드사진 계약서",
    entityLabel: "회사명",
    clientPartyTitle: "계약 고객사",
    directorLabel: "대표자",
    companyDisplayName: "제이크이미지연구소",
    footerTagline: "JAKE IMAGE INSTITUTE · Brand Image Direction",
    emailPlaceholder: "contact@jakeimage.com",
    scopeClause: "제이크이미지연구소는 기업·개인 브랜드 이미지 구축을 위한,\n전문 촬영 서비스(사진/영상)을 제공합니다.\n촬영 범위는 본 계약서 제2조의 항목에 한합니다.\n납품 결과물은 색보정 완료 JPG와 원본 파일을 제공합니다.\n영상 작업이 포함된 경우 편집 완료 영상(4K, FHD)을 파일로 제공합니다.\n촬영 항목 외 추가 촬영 시 별도 견적을 협의합니다.",
    copyrightClause: "촬영 결과물의 저작권은 계약 고객사에 귀속됩니다.\n제이크이미지연구소는 결과물을 포트폴리오, 홍보 및 마케팅 목적으로 사용할 수 있습니다.\n단, 민감한 정보나 얼굴 노출이 있는 부분은 고객사의 동의 없이는 사용하지 않습니다.",
    confidentialClause: "제이크이미지연구소는 촬영 과정에서 취득한 계약 고객사의 내부 정보를\n외부에 공개하지 않습니다.\n내부 정보에는 고객 정보, 경영 정보 등이 포함됩니다.\n결과물은 계약 고객사의 승인 전 SNS 등 외부 채널에 공개하지 않습니다.\n계약 고객사의 승인 후 제이크이미지연구소의 포트폴리오 채널에 게시될 수 있습니다.\n포트폴리오 채널에는 홈페이지, 인스타그램, 블로그 등이 포함됩니다.",
  },
};

const fmt = (value: number) => (value || 0).toLocaleString("ko-KR");

export function normalizeContractQuoteData(raw: unknown, contract: Record<string, unknown>): ContractQuoteData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const stringValue = (camel: string, snake: string, fallback = "") => {
    const value = data[camel] ?? data[snake] ?? fallback;
    return typeof value === "string" ? value : String(value ?? "");
  };
  const numberValue = (camel: string, snake: string) => {
    const value = Number(data[camel] ?? data[snake] ?? 0);
    return Number.isFinite(value) ? value : 0;
  };
  const items = Array.isArray(data.items) ? data.items.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const unitPrice = Number(row.unitPrice ?? row.unit_price ?? 0);
    const qty = Number(row.qty ?? row.quantity ?? 0);
    const subtotal = Number(row.subtotal ?? 0);
    return {
      name: String(row.name ?? ""), detail: String(row.detail ?? ""),
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      qty: Number.isFinite(qty) ? qty : 0,
      subtotal: Number.isFinite(subtotal) ? subtotal : 0,
      note: String(row.note ?? ""),
    };
  }) : [];

  return {
    hospitalName: stringValue("hospitalName", "hospital_name", String(contract.hospital_name ?? "")),
    contactName: stringValue("contactName", "contact_name", String(contract.contact_name ?? "")),
    businessNumber: stringValue("businessNumber", "business_number") || undefined,
    phone: stringValue("phone", "phone"), email: stringValue("email", "email", String(contract.email ?? "")),
    quoteNumber: stringValue("quoteNumber", "quote_number", String(contract.quote_number ?? "")),
    quoteDate: stringValue("quoteDate", "quote_date"), shootDate: stringValue("shootDate", "shoot_date") || null,
    validUntil: stringValue("validUntil", "valid_until"), items,
    supplyAmount: numberValue("supplyAmount", "supply_amount"), discountAmount: numberValue("discountAmount", "discount_amount"),
    vat: numberValue("vat", "vat"), totalAmount: numberValue("totalAmount", "total_amount"),
    depositAmount: numberValue("depositAmount", "deposit_amount"), balanceAmount: numberValue("balanceAmount", "balance_amount"),
    memos: data.memos == null ? null : String(data.memos),
    depositRate: contract.deposit_rate == null ? undefined : Number(contract.deposit_rate),
    paymentTerms: contract.payment_terms == null ? undefined : String(contract.payment_terms),
    deliveryTerms: contract.delivery_terms == null ? undefined : String(contract.delivery_terms),
    specialTerms: contract.special_terms == null ? undefined : String(contract.special_terms),
  };
}

export function buildContractHtml(q: ContractQuoteData, signatureDataUrl = "", brand: ContractBrand = "photoclinic"): string {
  const cfg = CONTRACT_BRAND_CONFIG[brand];
  const ink = brand === "jakeimage" ? "#162238" : "#155855";
  const accent = brand === "jakeimage" ? "#2f4a73" : "#E85D2C";
  const tint = brand === "jakeimage" ? "#EEF2F7" : "#FFF6F1";
  const tintBorder = brand === "jakeimage" ? "#CDDAEA" : "#F3C6B1";
  const quoteNumberPrefix = brand === "jakeimage" ? "JI-" : "PC-";
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const signatureHtml = signatureDataUrl ? `<img class="signature-image" src="${signatureDataUrl}" alt="${cfg.label} 서명">` : "";
  const effectiveDepositRate = q.depositRate ?? Math.round(((q.depositAmount || 0) / (q.totalAmount || 1)) * 100);
  const { depositAmount: effectiveDeposit, balanceAmount: effectiveBalance } = q.depositRate != null
    ? computeContractDeposit(q.totalAmount, q.depositRate)
    : { depositAmount: q.depositAmount, balanceAmount: q.balanceAmount };
  const itemCards = q.items.map((item, index) => `
    <div class="quote-item">
      <div class="item-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="item-main"><strong>${item.name}</strong>${item.detail ? `<span>${item.detail}</span>` : ""}${item.note ? `<em>${item.note}</em>` : ""}</div>
      <div class="item-amount"><small>수량 ${item.qty}</small><b>${fmt(item.subtotal)}원</b></div>
    </div>`).join("");
  const section = (num: string, title: string, content: string) => `<div class="section"><h3><span class="art">${num}</span>${title}</h3><div class="clause">${content}</div></div>`;
  const scope = cfg.scopeClause;
  const deliverables = `납품 파일: 색보정 완료 JPG, 원본 파일, 편집 완료 영상(4K, FHD)\n전달 방법: 클라우드(NAS) 링크로 전달\n납품 수량: 촬영 항목별 협의된 수량 기준\n현장 상황에 따라 납품 수량은 ±10% 범위에서 조정될 수 있습니다.\n파일 보관: 납품 후 3개월간 보관합니다.\n3개월 이후 데이터 백업 서버로 이동하며, 이동 후에도 링크 전달이 가능합니다.`;
  const schedule = `촬영 예정일: ${q.shootDate || "상호 협의 후 확정"}\n촬영 당일 준비사항은 사전 협의된 촬영 가이드를 따릅니다.\n최종 납품은 사진의 경우 촬영 완료일로부터 ${q.deliveryTerms || "3주"} 이내 전달합니다.\n영상의 경우 5~6주 이내 전달하는 것을 원칙으로 합니다.\n납품 일정은 작업 범위에 따라 상호 협의할 수 있습니다.\n보정 기간 중 천재지변 등 불가항력 사유 발생 시 일정은 상호 협의합니다.`;
  const payment = `계약 체결 시 선금(계약금) ${fmt(effectiveDeposit)}원을 납부합니다.\n잔금 ${fmt(effectiveBalance)}원은 ${q.paymentTerms || "마지막 촬영 직후"} 납부합니다.\n입금 계좌: 1002-754-988962 (우리은행 / 제이크이미지연구소)\n계약금 입금 확인 후 촬영 일정이 공식 확정됩니다.\n세금계산서는 선금, 잔금 2회 모두 발행 가능합니다.\n잔금 후 통합 발행도 가능합니다.`;
  const retake = `최종 전달 이후 추가 수정 요청은 1회에 한하여 무상으로 제공합니다.\n최종 전달 이후 14일이 지난 수정 요청은 유상으로 처리합니다.\n유상 수정 기준: 프로필 보정료 50,000원/1장, 연출사진 보정료 100,000원/10장`;
  const dispute = `본 계약과 관련한 분쟁은 상호 협의를 우선으로 하며,\n협의가 이루어지지 않을 경우 서울중앙지방법원을 관할 법원으로 합니다.\n본 계약서에 명시되지 않은 사항은 상관습 및 민법의 관련 규정에 따릅니다.`;
  const special = q.specialTerms
    ? `${q.specialTerms}\n\n본 계약서는 양 당사자가 서명(또는 날인)한 시점부터 법적 효력이 발생합니다.\n구두 합의 사항은 본 계약서에 반영된 경우에 한하여 효력을 인정합니다.\n촬영 현장에서의 안전사고에 대한 책임은 각 당사자가 부담합니다.`
    : `${q.memos ? `【메모】 ${q.memos}\n\n` : ""}본 계약서는 양 당사자가 서명(또는 날인)한 시점부터 법적 효력이 발생합니다.\n구두 합의 사항은 본 계약서에 반영된 경우에 한하여 효력을 인정합니다.\n촬영 현장에서의 안전사고에 대한 책임은 각 당사자가 부담합니다.`;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><base href="${baseHref}/"><title>${cfg.docTitle} · ${q.hospitalName}</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Noto Sans KR',sans-serif;color:#1C2B28;background:#F3F8F7;padding:18px 0;font-size:10.8px;line-height:1.55;margin:0}.contract-page{width:794px;height:1123px;margin:0 auto 18px;padding:42px 56px;background:#fff;overflow:hidden;position:relative;page-break-after:always}.contract-page:last-child{margin-bottom:0;page-break-after:auto}.top-accent{height:6px;background:${accent};border-radius:99px;margin-bottom:18px}.header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:start;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid ${ink}}.brand-logo{width:126px;height:auto;display:block;margin-bottom:8px}.brand-sub{font-size:8.8px;color:#6B8B87;margin-top:2px;line-height:1.45;white-space:nowrap}.doc-title{font-size:20px;font-weight:700;color:#1C2B28;letter-spacing:.3px;text-align:right;white-space:nowrap}.doc-meta{font-size:10px;color:#6B8B87;text-align:right;margin-top:6px;line-height:1.55}.doc-meta strong{color:${accent}}.parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}.party{border-top:3px solid ${ink};padding:9px 0 0;background:#fff}.party.party-client{border-top-color:${accent}}.party h3{font-size:10px;font-weight:700;color:${ink};letter-spacing:.02em;margin-bottom:7px}.party.party-client h3{color:${accent}}.party .row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:9px;padding:3px 0;font-size:10.4px;border-bottom:1px solid #EEF4F3}.party .k{color:#6B8B87}.party .v{font-weight:600;color:#1C2B28;word-break:keep-all;overflow-wrap:break-word;line-height:1.45}.section{margin-bottom:13px;break-inside:avoid}.section h3{font-size:10.6px;font-weight:700;color:${ink};margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #C8DDD9;display:flex;align-items:center;gap:7px}.art{display:inline-block;background:${ink};color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;flex-shrink:0}.section:nth-of-type(2n) .art{background:${accent}}.clause{border-left:3px solid ${ink};padding:2px 0 2px 11px;font-size:10px;line-height:1.6;color:#2C3E3D;white-space:pre-line;word-break:keep-all;overflow-wrap:break-word}.quote-list{display:grid;gap:3px;margin-bottom:8px}.quote-item{display:grid;grid-template-columns:36px minmax(0,1fr) 132px;gap:12px;align-items:start;padding:6px 0;border-bottom:1px solid #E4F0EE}.item-index{font-size:10px;font-weight:700;color:${accent}}.item-main strong{display:block;font-size:10.6px;color:#1C2B28;margin-bottom:1px;word-break:keep-all;overflow-wrap:break-word}.item-main span{display:block;font-size:9.2px;color:#6B8B87;line-height:1.35;word-break:keep-all;overflow-wrap:break-word}.item-main em{display:inline-block;margin-top:4px;font-style:normal;font-size:9px;color:#fff;background:${ink};border-radius:99px;padding:1px 7px}.item-amount{text-align:right}.item-amount small{display:block;font-size:9px;color:#9BB5B0;margin-bottom:2px}.item-amount b{font-size:10.8px;color:${ink}}.amount-panel{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:18px;align-items:end;border-top:2px solid ${ink};padding-top:8px}.amount-note{font-size:9px;color:#6B8B87;line-height:1.45;word-break:keep-all}.amt-row{display:flex;justify-content:space-between;padding:2px 0;font-size:9.8px;border-bottom:.5px solid #EEF4F3}.amt-row .l{color:#6B8B87}.amt-total{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;font-weight:700;color:${ink};border-top:2px solid ${accent};margin-top:2px}.pay-boxes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px}.pay-box{border:1px solid #C8DDD9;border-radius:7px;padding:8px;text-align:center;background:#FAFCFC}.pay-box .pt{font-size:10px;color:#9BB5B0;margin-bottom:3px}.pay-box .pa{font-size:14px;font-weight:700;color:${ink}}.pay-box:first-child .pa{color:${accent}}.pay-box .ps{font-size:10px;color:#9BB5B0;margin-top:2px}.effect-box{background:${tint};border:1px solid ${tintBorder};border-radius:7px;padding:8px 10px;margin:14px 0 12px;font-size:9.1px;color:#2C3E3D;line-height:1.55;text-align:center}.sign-area{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:stretch}.sign-box{min-width:0;border:1px solid #C8DDD9;border-radius:9px;padding:12px 14px}.sign-box h4{font-size:11px;font-weight:700;color:#6B8B87;margin-bottom:12px;padding-bottom:5px;border-bottom:1px solid #EEF4F3}.sl{display:grid;grid-template-columns:64px minmax(0,1fr);gap:8px;align-items:center;margin-bottom:6px}.sl .sk{font-size:9.8px;color:#9BB5B0}.sl .sv{font-size:10.8px;font-weight:600;color:#1C2B28;border-bottom:1px solid #C8DDD9;padding-bottom:1px;min-height:20px;min-width:0}.signature-image{display:block;width:128px;height:42px;object-fit:contain;object-position:left center}.stamp{margin-top:8px;height:42px;border:1px dashed #C8DDD9;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#C8DDD9}.effect-line{display:block;white-space:nowrap;letter-spacing:-.02em}.final-page{display:flex;flex-direction:column}.final-spacer{flex:1;min-height:260px}.footer{margin-top:12px;text-align:center;font-size:9px;color:#9BB5B0;padding-top:8px;border-top:1px solid #EEF4F3}@media print{body{padding:0;background:#fff}.contract-page{margin:0;box-shadow:none}@page{size:A4;margin:0}}
</style></head><body>
<div class="contract-page"><div class="top-accent"></div><div class="header"><div><img class="brand-logo" src="${cfg.logo}" alt="${cfg.logoAlt}"><div class="brand-sub">${cfg.brandSub}</div><div class="brand-sub">사업자번호: 190-16-00212 · 제이크이미지연구소</div></div><div><div class="doc-title">${cfg.docTitle}</div><div class="doc-meta"><strong>계약일: ${today}</strong><br>견적번호: ${q.quoteNumber || quoteNumberPrefix + new Date().toISOString().slice(0,10).replace(/-/g,"")}</div></div></div>
<div class="parties"><div class="party party-client"><h3>${cfg.clientPartyTitle}</h3><div class="row"><span class="k">${cfg.entityLabel}</span><span class="v">${q.hospitalName || "-"}</span></div><div class="row"><span class="k">${cfg.directorLabel}</span><span class="v">${q.contactName || "-"}</span></div><div class="row"><span class="k">사업자번호</span><span class="v">${q.businessNumber || "-"}</span></div><div class="row"><span class="k">연락처</span><span class="v">${q.phone || "-"}</span></div><div class="row"><span class="k">이메일</span><span class="v">${q.email || "-"}</span></div></div><div class="party"><h3>${cfg.companyDisplayName}</h3><div class="row"><span class="k">상호</span><span class="v">${cfg.companyDisplayName}</span></div><div class="row"><span class="k">대표자</span><span class="v">정연호</span></div><div class="row"><span class="k">사업자번호</span><span class="v">190-16-00212</span></div><div class="row"><span class="k">연락처</span><span class="v">010-8556-2988</span></div><div class="row"><span class="k">계좌</span><span class="v">1002-754-988962 (우리은행 / 제이크이미지연구소)</span></div></div></div>
${section("제1조", "계약 목적 및 촬영 범위", scope)}<div class="section"><h3><span class="art">제2조</span>촬영 항목 및 계약 금액</h3><div class="quote-list">${itemCards}</div><div class="amount-panel"><p class="amount-note">상기 금액은 견적서 기준으로 산정되며, 촬영 범위 또는 납품 범위가 변경되는 경우 상호 협의에 따라 조정될 수 있습니다.</p><div class="amt-box"><div class="amt-row"><span class="l">공급가액</span><span>${fmt(q.supplyAmount)}원</span></div>${q.discountAmount > 0 ? `<div class="amt-row"><span class="l">할인금액</span><span style="color:#E85D2C;">-${fmt(q.discountAmount)}원</span></div>` : ""}<div class="amt-row"><span class="l">부가세 (10%)</span><span>${fmt(q.vat)}원</span></div><div class="amt-total"><span>최종 계약금액</span><span>${fmt(q.totalAmount)}원</span></div></div></div></div>
<div class="section"><h3><span class="art">제3조</span>결제 조건</h3><div class="clause">${payment}</div><div class="pay-boxes"><div class="pay-box"><div class="pt">계약금 (선금 ${effectiveDepositRate}%)</div><div class="pa">${fmt(effectiveDeposit)}원</div><div class="ps">계약 체결 시 납부</div></div><div class="pay-box"><div class="pt">잔금 (${100 - effectiveDepositRate}%)</div><div class="pa">${fmt(effectiveBalance)}원</div><div class="ps">${q.paymentTerms || "마지막 촬영 직후"} 납부</div></div></div></div></div>
<div class="contract-page">${section("제4조", "납품물 및 전달 방식", deliverables)}${section("제5조", "촬영 일정 및 납품 기한", schedule)}${section("제6조", "저작권 및 사용권", cfg.copyrightClause)}${section("제7조", "수정 요청", retake)}${section("제8조", "비밀유지 및 결과물 공개", cfg.confidentialClause)}</div>
<div class="contract-page final-page">${section("제9조", "분쟁 해결", dispute)}${section("제10조", "특약사항", special)}<div class="final-spacer"></div><div class="effect-box"><span class="effect-line">위 계약의 성립을 증명하기 위하여 본 계약서를 2부 작성하고, 각 1부씩 보관합니다.</span><br><strong>${today}</strong></div><div class="sign-area"><div class="sign-box"><h4>${cfg.clientPartyTitle}</h4><div class="sl"><span class="sk">${cfg.entityLabel}</span><span class="sv">${q.hospitalName || ""}</span></div><div class="sl"><span class="sk">사업자번호</span><span class="sv">${q.businessNumber || ""}</span></div><div class="sl"><span class="sk">${cfg.directorLabel}</span><span class="sv">${q.contactName || ""}</span></div><div class="sl"><span class="sk">서명일</span><span class="sv"></span></div><div class="sl"><span class="sk">서명</span><span class="sv"></span></div><div class="stamp">직인 / 서명</div></div><div class="sign-box"><h4>${cfg.companyDisplayName}</h4><div class="sl"><span class="sk">상호</span><span class="sv">${cfg.companyDisplayName}</span></div><div class="sl"><span class="sk">사업자번호</span><span class="sv">190-16-00212</span></div><div class="sl"><span class="sk">대표자</span><span class="sv">정연호</span></div><div class="sl"><span class="sk">서명일</span><span class="sv">${today}</span></div><div class="sl"><span class="sk">서명</span><span class="sv">${signatureHtml}</span></div><div class="stamp">직인 / 서명</div></div></div><div class="footer">${cfg.footerTagline}<br>본 계약서는 양 당사자가 서명한 시점부터 법적 효력이 발생합니다.</div></div></body></html>`;
}

export function buildContractHtmlFromRow(contract: Record<string, unknown>): string {
  const quote = normalizeContractQuoteData(contract.quote_data, contract);
  if (!quote) return "";
  const brand: ContractBrand = quote.quoteNumber.startsWith("JI-") ? "jakeimage" : "photoclinic";
  return buildContractHtml(quote, String(contract.signature_data_url ?? ""), brand);
}
