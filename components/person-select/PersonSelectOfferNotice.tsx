import { formatPersonSelectWon, type PersonSelectMeData } from "./personSelectPublicModel";
import styles from "./PersonSelectPublic.module.css";

export function PersonSelectOfferNotice({ me }: { me: PersonSelectMeData }) {
  const notice = me.event.offer_notice?.trim();
  const extraPrice = me.event.extra_price ?? 0;
  if (!notice && !extraPrice && !(me.event.offers ?? []).length) return null;
  return <div className={styles.offerNotice}>
    {notice ? <p>{notice}</p> : null}
    {extraPrice ? <p className={styles.offerNoticePrice}>추가 보정 {formatPersonSelectWon(extraPrice)}/장 · 기본 장수보다 더 고르면 자동으로 추가돼요{me.event.extra_max ? ` (최대 ${me.event.extra_max}장)` : ""}.</p> : null}
  </div>;
}
