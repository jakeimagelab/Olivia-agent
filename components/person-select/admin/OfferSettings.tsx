"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_PERSON_SELECT_EXTRA_MAX,
  DEFAULT_PERSON_SELECT_EXTRA_PRICE,
  DEFAULT_PERSON_SELECT_NOTICE,
  DEFAULT_PERSON_SELECT_OFFERS,
  type PersonSelectOffer,
} from "@/lib/person-select/types";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

export type PersonSelectOfferSettingsValue = {
  offer_notice?: string;
  extra_price?: number;
  extra_max?: number;
  offers?: PersonSelectOffer[];
};

/** "6R (6x8inch) = 30000" 한 줄의 가격을 읽는다. 3만, 30,000원 표기도 받는다. */
export function parsePersonSelectOfferPrice(text: string) {
  const value = text.replace(/[,\s원]/g, "");
  const man = value.match(/^(\d+(?:\.\d+)?)만$/);
  if (man) return Math.round(Number(man[1]) * 10_000);
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

export function personSelectOfferOptionsToText(offer: PersonSelectOffer) {
  return offer.options.map((option) => `${option.label} = ${option.price}`).join("\n");
}

export function parsePersonSelectOfferOptions(text: string, previous: PersonSelectOffer["options"]) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const at = line.lastIndexOf("=");
    const label = (at >= 0 ? line.slice(0, at) : line).trim();
    const price = at >= 0 ? parsePersonSelectOfferPrice(line.slice(at + 1)) : NaN;
    // 이미 받은 주문이 끊기지 않게 같은 이름의 선택지는 기존 구분값을 그대로 쓴다.
    const key = previous.find((option) => option.label === label)?.key ?? `opt-${Date.now().toString(36)}-${index}`;
    return { key, label, price: Number.isFinite(price) ? price : -1 };
  });
}

/** 관리자 프로젝트 설정: 고객 안내 문구, 추가 보정 가격, 신청받을 상품. */
export function OfferSettings({ event, onChange }: {
  event: PersonSelectOfferSettingsValue;
  onChange: (patch: Partial<PersonSelectOfferSettingsValue>) => void;
}) {
  const offers = event.offers ?? [];
  const [optionTexts, setOptionTexts] = useState<Record<string, string>>(() => Object.fromEntries(offers.map((offer) => [offer.key, personSelectOfferOptionsToText(offer)])));
  const empty = !event.offer_notice && !event.extra_price && !offers.length;
  const setOffer = (index: number, patch: Partial<PersonSelectOffer>) => onChange({ offers: offers.map((offer, offerIndex) => offerIndex === index ? { ...offer, ...patch } : offer) });

  function fillDefaults() {
    onChange({ offer_notice: DEFAULT_PERSON_SELECT_NOTICE, extra_price: DEFAULT_PERSON_SELECT_EXTRA_PRICE, extra_max: DEFAULT_PERSON_SELECT_EXTRA_MAX, offers: DEFAULT_PERSON_SELECT_OFFERS });
    setOptionTexts(Object.fromEntries(DEFAULT_PERSON_SELECT_OFFERS.map((offer) => [offer.key, personSelectOfferOptionsToText(offer)])));
  }

  function addOffer() {
    const key = `offer-${Date.now().toString(36)}`;
    onChange({ offers: [...offers, { key, label: "", unit: "개", price: 0, note: "", needs_photo: false, options: [] }] });
    setOptionTexts({ ...optionTexts, [key]: "" });
  }

  return <div className={`${styles.field} ${styles.fieldFull}`}>
    <label>고객 안내 · 추가 주문</label>
    <div className={styles.offerBox}>
      {empty ? <div className={styles.offerEmpty}><span>아직 안내 문구와 상품이 없어요.</span><button className={styles.secondary} onClick={fillDefaults}>기본값 불러오기 (추가 보정 5만원 · 액자 · 앨범)</button></div> : null}
      <div className={styles.field}><small className={styles.summary}>고객 화면 맨 위에 보이는 글</small><textarea className={styles.textarea} maxLength={2000} value={event.offer_notice ?? ""} onChange={(event) => onChange({ offer_notice: event.target.value })} placeholder="예: 한 분당 보정본 1장을 드립니다." /></div>
      <div className={styles.offerRow}>
        <div className={styles.field}><small className={styles.summary}>추가 보정 가격 (장당, 0이면 추가로 못 고름)</small><input className={styles.input} inputMode="numeric" value={event.extra_price ?? 0} onChange={(event) => onChange({ extra_price: Number(event.target.value.replace(/\D/g, "")) || 0 })} /></div>
        <div className={styles.field}><small className={styles.summary}>더 고를 수 있는 최대 장수</small><select className={styles.select} value={event.extra_max ?? 0} onChange={(event) => onChange({ extra_max: Number(event.target.value) })}>{Array.from({ length: 21 }, (_, count) => <option key={count} value={count}>{count}장</option>)}</select></div>
      </div>
      {offers.map((offer, index) => <div key={offer.key} className={styles.offerItem}>
        <div className={styles.offerRow}>
          <div className={styles.field}><small className={styles.summary}>상품 이름</small><input className={styles.input} value={offer.label} onChange={(event) => setOffer(index, { label: event.target.value })} placeholder="예: 액자 제작" /></div>
          <div className={styles.field}><small className={styles.summary}>단위</small><input className={styles.input} value={offer.unit} onChange={(event) => setOffer(index, { unit: event.target.value })} placeholder="개, 권" /></div>
          <div className={styles.field}><small className={styles.summary}>가격 (크기 선택지가 없을 때)</small><input className={styles.input} inputMode="numeric" value={offer.price} onChange={(event) => setOffer(index, { price: Number(event.target.value.replace(/\D/g, "")) || 0 })} disabled={Boolean(offer.options.length)} /></div>
        </div>
        <div className={styles.offerRow}>
          <div className={styles.field}><small className={styles.summary}>크기·종류 선택지 (한 줄에 하나: 이름 = 가격)</small><textarea className={styles.textarea} value={optionTexts[offer.key] ?? personSelectOfferOptionsToText(offer)} onChange={(event) => { setOptionTexts({ ...optionTexts, [offer.key]: event.target.value }); setOffer(index, { options: parsePersonSelectOfferOptions(event.target.value, offer.options) }); }} placeholder={"6R (6x8inch) = 30000\n16R (16x20inch) = 100000"} /></div>
          <div className={styles.field}><small className={styles.summary}>구성 설명 (고객에게 보임)</small><textarea className={styles.textarea} value={offer.note} onChange={(event) => setOffer(index, { note: event.target.value })} placeholder={"20P 블랙가죽\n5x7inch 액자 포함"} /></div>
        </div>
        <div className={styles.offerFoot}>
          <label className={styles.check}><input type="checkbox" checked={offer.needs_photo} onChange={(event) => setOffer(index, { needs_photo: event.target.checked })} /> 고객이 고른 사진 중 하나를 지정 (액자 등)</label>
          <button className={styles.weak} onClick={() => onChange({ offers: offers.filter((_, offerIndex) => offerIndex !== index) })}><Trash2 size={14} /> 상품 빼기</button>
        </div>
        {offer.options.some((option) => option.price < 0) ? <p className={styles.disabledReason}>가격을 읽지 못한 줄이 있어요. &quot;이름 = 30000&quot; 처럼 적어주세요.</p> : null}
      </div>)}
      <button className={styles.secondary} onClick={addOffer}><Plus size={15} />상품 추가</button>
    </div>
  </div>;
}
