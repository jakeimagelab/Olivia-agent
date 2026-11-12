"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Minus, Plus, Trash2, X } from "lucide-react";
import { offerImagesFor } from "@/lib/person-select/types";
import { PersonSelectOfferNotice as OfferNotice } from "./PersonSelectOfferNotice";
import {
  formatPersonSelectWon as won,
  personSelectExtraCount as extraCount,
  shortPersonSelectFileName as shortFileName,
  type PersonSelectOffer as Offer,
  type PersonSelectOrderItem as OrderItem,
} from "./personSelectPublicModel";
import {
  personSelectJsonFetch as jsonFetch,
  usePersonSelectData as useSelectionData,
} from "./usePersonSelectPublicData";
import styles from "./PersonSelectPublic.module.css";

/** 추가 주문 화면: 안내 문구, 추가 보정(자동 계산), 액자·앨범 같은 상품 신청 */
export function PersonSelectOrder({ slug }: { slug: string }) {
  const router = useRouter();
  const { me, loading, error } = useSelectionData(slug);
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (me && items === null) setItems(me.order?.items ?? []); }, [me, items]);
  if (loading || !me || items === null) return <main className={styles.page}><div className={styles.done}>{error || "불러오는 중이에요"}</div></main>;
  const currentItems = items;
  const offers = me.event.offers ?? [];
  const photos = me.categories.flatMap((category) => category.choices);
  const extra = me.categories.reduce((sum, category) => sum + extraCount(category), 0);
  const extraPrice = me.event.extra_price ?? 0;
  const priceOf = (item: OrderItem) => { const offer = offers.find((entry) => entry.key === item.offer_key); const option = offer?.options.find((entry) => entry.key === item.option_key); return option ? option.price : offer?.price ?? 0; };
  const total = extra * extraPrice + currentItems.reduce((sum, item) => sum + priceOf(item) * item.qty, 0);
  const update = (index: number, patch: Partial<OrderItem>) => setItems(currentItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const add = (offer: Offer) => setItems([...currentItems, { offer_key: offer.key, option_key: offer.options[0]?.key ?? null, image_id: offer.needs_photo ? photos[0]?.image_id ?? null : null, qty: 1 }]);

  async function save() {
    setBusy(true); setMessage("");
    try { await jsonFetch(`/api/pick/${slug}/orders`, { method: "PUT", body: JSON.stringify({ items: currentItems }) }); router.push(`/pick/${slug}/home`); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}><button className={styles.weak} onClick={() => router.push(`/pick/${slug}/home`)} aria-label="뒤로"><ArrowLeft /></button><strong>추가 주문</strong><span style={{ width: 44 }} /></header>
    <section className={styles.feedbackContent} style={{ paddingBottom: 200 }}>
      <p className={styles.eyebrow}>선택 사항</p><h1>필요한 것만 신청해 주세요.</h1>
      <OfferNotice me={me} />
      {extraPrice ? <div className={styles.orderCard}>
        <div className={styles.orderCardHead}><div><h3>추가 보정</h3><p className={styles.muted}>기본 장수보다 더 고른 사진만큼 자동으로 계산돼요.</p></div><b>{won(extraPrice)}/장</b></div>
        <div className={styles.orderLine}><span>지금 추가로 고른 사진 {extra}장</span><b>{won(extra * extraPrice)}</b></div>
        <button className={styles.secondary} onClick={() => router.push(`/pick/${slug}/home`)}>사진 더 고르기</button>
      </div> : null}
      {offers.length ? <div className={styles.offerGrid}>
        {offers.map((offer) => {
          const blocked = offer.needs_photo && !photos.length;
          const activeOptionKeys = currentItems.filter((item) => item.offer_key === offer.key).map((item) => item.option_key);
          return <div key={offer.key} className={`${styles.orderCard} ${styles.offerTile}`}>
            <div><h3>{offer.label}</h3><b className={styles.offerTilePrice}>{offer.options.length ? `${won(Math.min(...offer.options.map((option) => option.price)))}부터` : `${won(offer.price)}/${offer.unit || "개"}`}</b></div>
            <OfferImages offer={offer} activeOptionKeys={activeOptionKeys} />
            {offer.options.length ? <p className={styles.offerTileNote}>{offer.options.map((option) => `${option.label.split(" (")[0]} ${won(option.price)}`).join("\n")}</p> : null}
            {offer.note ? <p className={styles.offerTileNote}>{offer.note}</p> : null}
            <button className={`${styles.secondary} ${styles.orderAdd}`} disabled={blocked || me.event.locked} onClick={() => add(offer)}><Plus size={15} />추가</button>
            {blocked ? <p className={styles.muted}>사진을 먼저 골라 주세요.</p> : null}
          </div>;
        })}
      </div> : null}
      {currentItems.length ? <div className={styles.orderCard}>
        <div className={styles.orderCardHead}><div><h3>신청 내역</h3></div></div>
        {currentItems.map((item, index) => {
          const offer = offers.find((entry) => entry.key === item.offer_key);
          if (!offer) return null;
          return <div key={index} className={styles.orderLine}>
            <span className={styles.orderLineTitle}>{offer.label}</span>
            {offer.options.length ? <select className={styles.orderSelect} value={item.option_key ?? ""} onChange={(event) => update(index, { option_key: event.target.value })}>{offer.options.map((option) => <option key={option.key} value={option.key}>{option.label} · {won(option.price)}</option>)}</select> : null}
            {offer.needs_photo ? <select className={styles.orderSelect} value={item.image_id ?? ""} onChange={(event) => update(index, { image_id: event.target.value })}>{photos.map((photo) => <option key={photo.image_id} value={photo.image_id}>{shortFileName(photo.original_file_name)}</option>)}</select> : null}
            <span className={styles.qty}><button aria-label="수량 줄이기" disabled={item.qty <= 1} onClick={() => update(index, { qty: item.qty - 1 })}><Minus size={14} /></button><b>{item.qty}</b><button aria-label="수량 늘리기" disabled={item.qty >= 20} onClick={() => update(index, { qty: item.qty + 1 })}><Plus size={14} /></button></span>
            <b>{won(priceOf(item) * item.qty)}</b>
            <button className={styles.weak} aria-label="빼기" onClick={() => setItems(currentItems.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
          </div>;
        })}
      </div> : null}
      {message ? <div className={styles.error}>{message}</div> : null}
    </section>
    <footer className={styles.feedbackDock}><div><div className={styles.orderSummaryTotal}><span>합계</span><b>{won(total)}</b></div><button className={styles.primary} disabled={me.event.locked || busy} onClick={save}>저장하고 돌아가기</button><small>결제 방법은 포토클리닉에서 따로 안내드려요.<br />최종 제출은 홈에서 해주세요.</small></div></footer>
  </main>;
}

/** 상품 예시 사진. 누르면 크게 본다. 고객이 고른 크기의 사진은 테두리로 표시한다. */
function OfferImages({ offer, activeOptionKeys }: { offer: Offer; activeOptionKeys: (string | null)[] }) {
  const images = offerImagesFor(offer);
  const [open, setOpen] = useState<string | null>(null);
  if (!images.length) return null;
  const opened = images.find((image) => image.src === open);
  return <>
    <div className={images.length > 1 ? styles.offerImagesTwo : styles.offerImages}>
      {images.map((image) => {
        const active = Boolean(image.option_keys?.some((key) => activeOptionKeys.includes(key)));
        return <button key={image.src} type="button" className={`${styles.offerImage} ${active ? styles.offerImageActive : ""}`} onClick={() => setOpen(image.src)} aria-label={`${image.caption} 크게 보기`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={image.caption} loading="lazy" />
          <span>{image.caption}</span>
        </button>;
      })}
    </div>
    {opened ? <div className={styles.offerImageViewer} role="dialog" aria-label={opened.caption} onClick={() => setOpen(null)}>
      <button type="button" className={styles.offerImageClose} aria-label="닫기" onClick={() => setOpen(null)}><X size={20} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={opened.src} alt={opened.caption} />
      <span>{opened.caption}</span>
    </div> : null}
  </>;
}
