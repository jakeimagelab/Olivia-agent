"use client";

import { Image as ImageIcon, Images } from "lucide-react";
import styles from "./PersonSelectCustomerTabs.module.css";

export type PersonSelectCustomerView = "original" | "delivery";

export function PersonSelectCustomerTabs({
  active,
  deliveryAvailable,
  onChange,
}: {
  active: PersonSelectCustomerView;
  deliveryAvailable: boolean;
  onChange: (view: PersonSelectCustomerView) => void;
}) {
  return <nav className={styles.tabs} role="tablist" aria-label="사진 보기">
    <button type="button" role="tab" aria-selected={active === "original"} className={active === "original" ? styles.active : ""} onClick={() => onChange("original")}><ImageIcon size={15} aria-hidden="true" />원본</button>
    <button type="button" role="tab" aria-selected={active === "delivery"} className={active === "delivery" ? styles.active : ""} disabled={!deliveryAvailable} title={deliveryAvailable ? "업로드된 보정본을 확인합니다." : "보정본을 준비 중입니다."} onClick={() => onChange("delivery")}><Images size={15} aria-hidden="true" />보정본</button>
  </nav>;
}
