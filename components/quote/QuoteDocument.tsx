"use client";

/* eslint-disable @next/next/no-img-element -- Canonical document/PDF capture requires the raw image dimensions used by the Desktop sheet. */

import type { ReactNode, Ref } from "react";
import { Building2, Mail, MapPin, Phone, Quote, Receipt, UserRound } from "lucide-react";
import { BRAND_CONFIG, packages, singleItems } from "@/lib/quote/quoteCatalog";
import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import { quoteRowToFormState } from "@/lib/quote/quoteRowMapping";
import type { BenefitItem, Brand, CustomItem, CustomerInfo } from "@/lib/quote/quoteFormTypes";
import { getQuoteRailNameSize } from "@/lib/quote/quoteTypography";

export type QuoteDocumentLine = {
  id: string;
  name: string;
  detail?: string;
  amount: number;
};

export type QuoteDocumentData = {
  brand: Brand;
  customer: CustomerInfo;
  quoteTitle: string;
  packageItem: QuoteDocumentLine | null;
  singleItems: QuoteDocumentLine[];
  optionItems: QuoteDocumentLine[];
  customItems: CustomItem[];
  benefitItems: BenefitItem[];
  discountRate: number;
  rateDiscountAmount: number;
  extraDiscountAmount: number;
  discountTotal: number;
  contentSubtotal: number;
  supplyAmount: number;
  vat: number;
  finalAmount: number;
  depositRate: number;
  memo: string;
};

const amount = (value: number) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);
const displayDate = (date: string) => date || "-";

function optionLines(state: ReturnType<typeof quoteRowToFormState>, largeScaleLabel: string): QuoteDocumentLine[] {
  return [
    { id: "profile_shoot", name: "프로필 인원 추가", detail: `${state.profileCount}인`, amount: state.profileCount * 250000, visible: state.profileCount > 0 },
    { id: "staged_shoot", name: "연출 인원 추가", detail: `${state.stagedCount}인`, amount: state.stagedCount * 450000, visible: state.stagedCount > 0 },
    { id: "combined_profile_staged", name: "프로필/연출 추가", detail: `${state.combinedProfileStagedCount}인`, amount: state.combinedProfileStagedCount * 650000, visible: state.combinedProfileStagedCount > 0 },
    { id: "floor_shoot", name: "인테리어 층수 추가", detail: `${state.floorCount}층`, amount: state.floorCount * 250000, visible: state.floorCount > 0 },
    { id: "large_hospital", name: largeScaleLabel, detail: "적용", amount: 750000, visible: state.largeHospital },
    { id: "drone_shoot", name: "드론촬영", detail: `${state.droneCount}회`, amount: state.droneCount * 500000, visible: state.droneCount > 0 },
  ].filter((item) => item.visible).map((item) => ({ id: item.id, name: item.name, detail: item.detail, amount: item.amount }));
}

/**
 * Converts the canonical quotes row into the exact view model used by the Desktop sheet.
 * Agent-overridden rows follow the same quoteRowToFormState fallback as QuoteBuilder.
 */
export function quoteDocumentDataFromRow(row: Record<string, unknown>): QuoteDocumentData {
  const state = quoteRowToFormState(row);
  const cfg = BRAND_CONFIG[state.brand];
  const packageItem = packages.find((item) => item.id === state.selectedPackageId);
  const selectedSingles = singleItems.filter((item) => state.selectedSingleItemIds.includes(item.id));
  const singleLines = selectedSingles.map((item) => ({
    id: item.id,
    name: item.name,
    amount: state.brand === "jakeimage" ? (state.singleItemAmounts[item.id] || 0) : item.price,
  }));
  const options = optionLines(state, cfg.largeScaleLabel);
  const customItems = state.customItems.filter((item) => item.name || item.detail || item.amount > 0);
  const benefitItems = state.benefitItems.filter((item) => item.name);
  const totals = computeQuoteTotals({
    packageTotal: packageItem?.price ?? 0,
    singleItemsTotal: singleLines.reduce((sum, item) => sum + item.amount, 0),
    optionsTotal: options.reduce((sum, item) => sum + item.amount, 0),
    customItems,
    discountRate: state.discountRate,
    extraDiscount: state.extraDiscount,
  });

  return {
    brand: state.brand,
    customer: state.customer,
    quoteTitle: state.quoteTitle || String(row.title || ""),
    packageItem: packageItem ? { id: packageItem.id, name: packageItem.name, detail: packageItem.composition, amount: packageItem.price } : null,
    singleItems: singleLines,
    optionItems: options,
    customItems,
    benefitItems,
    discountRate: state.discountRate,
    rateDiscountAmount: totals.rateDiscountAmount,
    extraDiscountAmount: totals.extraDiscountAmount,
    discountTotal: totals.discountTotal,
    contentSubtotal: totals.contentSubtotal,
    supplyAmount: totals.supplyAmount,
    vat: totals.vat,
    finalAmount: totals.finalAmount,
    depositRate: state.depositRate,
    memo: state.memo,
  };
}

function Info({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return <div><span>{icon}{label}</span><strong>{value}</strong></div>;
}

/** The canonical Desktop quote sheet. Shells own scaling, scrolling and controls. */
export default function QuoteDocument({ data, scale = 1, pageRef }: { data: QuoteDocumentData; scale?: number; pageRef?: Ref<HTMLDivElement> }) {
  const {
    brand, customer, quoteTitle, packageItem, singleItems: selectedSingleItems, optionItems,
    customItems: visibleCustomItems, benefitItems: visibleBenefitItems, discountRate,
    rateDiscountAmount, extraDiscountAmount, discountTotal, contentSubtotal, supplyAmount,
    vat, finalAmount, depositRate, memo,
  } = data;
  const cfg = BRAND_CONFIG[brand];

  return (
    <div ref={pageRef} className="quote-page" style={{ transform: `scale(${scale})` }}>
      <aside className="brand-rail">
        <div className="rail-slogan" style={brand === "photoclinic" ? { fontFamily: "'Nanum Myeongjo', serif" } : undefined}>
          {cfg.sloganLines.map((line, index) => <p key={index}>{line}</p>)}
          <span className="rail-divider" aria-hidden="true" />
          <div className="rail-caption"><strong>{cfg.railCaptionTitle}</strong><span>{cfg.railCaptionSub}</span></div>
        </div>
        <div className="rail-address">
          <span>TO.</span>
          <strong className={`rail-customer-name rail-customer-name--${getQuoteRailNameSize(customer.hospitalName || cfg.entityLabel)}`}>{customer.hospitalName || cfg.entityLabel}</strong>
          <small>{customer.managerName || "담당자"}</small>
        </div>
        <div className="rail-notice">
          <strong>CONTACT</strong>
          <div className="rail-contact-row"><Receipt size={11} /><span>선금 50%, 잔금 50% 기준<br />세부 조건은 상호 협의 가능</span></div>
          <div className="rail-contact-row"><Phone size={11} /><span>1002-754-988962<br />우리은행</span></div>
          <div className="rail-contact-row"><MapPin size={11} /><span>제이크이미지연구소<br />(정헌호)</span></div>
        </div>
        <div className="rail-notice rail-notice--brand"><strong>{cfg.railNoticeTitle}</strong><span>{cfg.railNoticeSub}</span><span>{cfg.railNoticeDetail}</span></div>
      </aside>

      <div className="quote-content">
        <header className="quote-hero">
          <div className="invoice-meta">
            <div><span>견적번호</span><strong>{customer.quoteNumber}</strong></div>
            <div><span>견적일</span><strong>{displayDate(customer.quoteDate)}</strong></div>
            <div><span>촬영 예정일</span><strong>{displayDate(customer.shootDate)}</strong></div>
            <div><span>견적 유효기간</span><strong>{displayDate(customer.validUntil)}</strong></div>
          </div>
          <h2 style={{ fontFamily: "'Nanum Myeongjo', serif", whiteSpace: "pre-line" }}>{quoteTitle || cfg.defaultQuoteTitle}</h2>
        </header>

        <section className="client-strip">
          <Info icon={<Building2 size={11} />} label={cfg.entityLabel} value={customer.hospitalName || "-"} />
          <Info icon={<UserRound size={11} />} label="담당자명" value={customer.managerName || "-"} />
          <Info icon={<Phone size={11} />} label="연락처" value={customer.phone || "-"} />
          <Info icon={<Mail size={11} />} label="이메일" value={customer.email || "-"} />
        </section>

        <section className="estimate-table-wrap">
          <table className="quote-table">
            <thead><tr><th>항목</th><th>수량</th><th>가격</th><th>소계</th><th>비고</th></tr></thead>
            <tbody>
              <tr className="category-row"><td colSpan={5}>촬영 콘텐츠</td></tr>
              {packageItem ? <tr><td>1. {packageItem.name} 패키지<small>{packageItem.detail}</small></td><td></td><td>{amount(packageItem.amount)}</td><td>{amount(packageItem.amount)}</td><td>촬영 패키지</td></tr> : null}
              {selectedSingleItems.length ? <tr className="category-row"><td colSpan={5}>단일 항목</td></tr> : null}
              {selectedSingleItems.map((item, index) => <tr key={item.id}><td>{(packageItem ? 2 : 1) + index}. {item.name}</td><td></td><td>{amount(item.amount)}</td><td>{amount(item.amount)}</td><td>단일 콘텐츠</td></tr>)}
              {optionItems.map((item, index) => <tr key={item.id}><td>{(packageItem ? 1 : 0) + selectedSingleItems.length + index + 1}. {item.name}{item.detail ? <small>{item.detail}</small> : null}</td><td></td><td>{amount(item.amount)}</td><td>{amount(item.amount)}</td><td>-</td></tr>)}
              {visibleCustomItems.map((item, index) => <tr key={item.id}><td>{(packageItem ? 1 : 0) + selectedSingleItems.length + optionItems.length + index + 1}. {item.name || cfg.customItemsLabel}{item.detail ? <small style={{ whiteSpace: "pre-line" }}>- {item.detail}</small> : null}</td><td></td><td>{amount(item.amount)}</td><td>{amount(item.amount)}</td><td>기타</td></tr>)}
              {visibleBenefitItems.length ? <tr className="category-row"><td colSpan={5}>서비스 및 혜택</td></tr> : null}
              {visibleBenefitItems.map((item, index) => <tr key={item.id}><td>{(packageItem ? 1 : 0) + selectedSingleItems.length + optionItems.length + visibleCustomItems.length + index + 1}. {item.name}</td><td></td><td>-</td><td>-</td><td>서비스 및 혜택</td></tr>)}
              {discountRate > 0 ? <tr className="discount-row"><td>{discountRate}% 할인</td><td>-</td><td>-{amount(rateDiscountAmount)}</td><td>-{amount(rateDiscountAmount)}</td><td>촬영콘텐츠 합계 기준</td></tr> : null}
              {extraDiscountAmount > 0 ? <tr className="discount-row"><td>추가할인(절삭)</td><td>-</td><td>-{amount(extraDiscountAmount)}</td><td>-{amount(extraDiscountAmount)}</td><td>최종금액 조정</td></tr> : null}
              {contentSubtotal === 0 ? <tr><td>선택된 촬영 항목 없음</td><td>-</td><td>0</td><td>0</td><td>-</td></tr> : null}
              <tr className="blank-row"><td colSpan={5}></td></tr>
            </tbody>
          </table>
        </section>

        <footer className="quote-bottom">
          <div className="payment-box">
            <div className="payment-terms-note"><strong>결제조건</strong><span>선금 50%, 잔금 50% 기준<br />세부 조건은 상호 협의 가능</span></div>
            <div className="payment-terms-rows">
              <div className="payment-row">{depositRate > 0 ? <><span className="payment-label"><span className="payment-icon" aria-hidden="true">₩</span><strong>선금{depositRate}%</strong></span><span>{amount(Math.round(finalAmount * depositRate / 100))}</span></> : null}</div>
              <div className="payment-row">{depositRate < 100 ? <><span className="payment-label"><span className="payment-icon" aria-hidden="true">₩</span><strong>잔금{100 - depositRate}%</strong></span><span>{amount(Math.round(finalAmount * (100 - depositRate) / 100))}</span></> : null}</div>
              <p>세부 결제 조건은 상호 협의에 따라 조정될 수 있습니다.</p>
            </div>
          </div>
          <div className="total-signature"><div className="total-box">
            <div><span>공급가액</span><strong>{amount(supplyAmount)}</strong></div>
            <div><span>할인 합계</span><strong>{discountTotal ? `-${amount(discountTotal)}` : "0"}</strong></div>
            <div><span>부가세/10%</span><strong>{amount(vat)}</strong></div>
            <div className="grand-total"><span>KRW</span><strong>{amount(finalAmount)}</strong></div>
          </div></div>
          <div className="contract-note"><Quote className="contract-note-icon" aria-hidden="true" /><div><strong>계약 안내</strong><p>본 견적서는 상호 협의 및 선금 입금 시 계약서의 효력을 대신할 수 있습니다. 촬영 범위 변경 시 최종 금액은 조정될 수 있습니다.</p>{memo.trim() ? <small>{memo}</small> : null}</div></div>
        </footer>

        <div className="quote-brand-mark">
          <div className="brand-mark-spacer" aria-hidden="true" />
          <div className="brand-logo-stack"><img src={cfg.logo} alt={cfg.label} className="brand-logo-image" /><p>{cfg.brandMarkCaption}</p></div>
          <div className="signature-area brand-signature"><span>Director Signature</span><img src="/assets/ceo-signature.png" alt="Director Signature" /></div>
        </div>
      </div>
    </div>
  );
}
