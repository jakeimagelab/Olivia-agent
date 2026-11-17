"use client";

import { Check, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import type { PersonSelectCustomerStageNumber } from "@/lib/person-select/adminWorkspace";
import styles from "./PersonSelectCustomerStageHeader.module.css";

const STAGES: Array<{ number: PersonSelectCustomerStageNumber; label: string; title: string; description: string }> = [
  { number: 1, label: "사진 고르기", title: "사진을 골라 주세요", description: "마음에 드는 사진을 고르고 필요한 보정 내용을 남겨 주세요." },
  { number: 2, label: "보정본 확인", title: "보정본을 확인해 주세요", description: "사진마다 좋아요를 누르거나 수정할 내용을 적어 주세요." },
  { number: 3, label: "다운로드", title: "완성된 사진을 받아 주세요", description: "최종 확인한 고화질 사진을 한 장씩 또는 한 번에 받을 수 있어요." },
];

export function PersonSelectCustomerStageHeader({
  title,
  viewerName,
  currentStage,
  viewingStage,
  onStageChange,
  offersOpen = false,
  offersHref,
  trailing,
}: {
  title: string;
  viewerName?: string;
  currentStage: PersonSelectCustomerStageNumber;
  viewingStage: PersonSelectCustomerStageNumber;
  onStageChange: (stage: PersonSelectCustomerStageNumber) => void;
  offersOpen?: boolean;
  offersHref?: string;
  trailing?: ReactNode;
}) {
  const active = STAGES[viewingStage - 1];
  return <header className={styles.shell}>
    <div className={styles.topline}>
      <div className={styles.heading}>
        <p>{title}{viewerName ? ` · ${viewerName} 님` : ""}</p>
        <h1>{active.title}</h1>
        <span>{active.description}</span>
      </div>
      <div className={styles.actions}>
        {trailing}
        {offersOpen && offersHref ? <a className={styles.offerButton} href={offersHref}><ShoppingBag size={16} />액자·앨범</a> : null}
      </div>
    </div>
    <nav className={styles.progress} aria-label="사진 전달 단계">
      {STAGES.map((stage, index) => {
        const reached = stage.number <= currentStage;
        const selected = stage.number === viewingStage;
        const past = stage.number < currentStage;
        return <button
          key={stage.number}
          type="button"
          className={selected ? styles.selected : reached ? styles.reached : ""}
          disabled={!reached}
          aria-current={selected ? "step" : undefined}
          onClick={() => reached && onStageChange(stage.number)}
        >
          <i>{past ? <Check size={14} /> : stage.number}</i>
          <span>{stage.label}</span>
          {index < STAGES.length - 1 ? <b aria-hidden="true" /> : null}
        </button>;
      })}
    </nav>
  </header>;
}
