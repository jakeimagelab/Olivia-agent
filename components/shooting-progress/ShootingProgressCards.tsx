"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ShootingProgressCard } from "@/lib/photo-storage/shootingProgress";
import { ShootingProgressDialog } from "./ShootingProgressDialog";
import styles from "./ShootingProgressCards.module.css";

const COLLAPSED_COUNT = 3;

function toneLabel(card: ShootingProgressCard): string {
  if (card.actionRequired) return "할 일";
  if (card.tone === "progress") return "진행 중";
  return "기다리는 중";
}

export function ShootingProgressCards({
  cards,
  variant,
  onOpen,
  onUpdated,
  onOpenFolder,
  onOpenClient,
}: {
  cards: ShootingProgressCard[];
  variant: "mobile" | "desktop";
  onOpen?: (card: ShootingProgressCard) => void;
  onUpdated?: () => Promise<void> | void;
  onOpenFolder?: (card: ShootingProgressCard) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<ShootingProgressCard | null>(null);
  const visibleCards = expanded ? cards : cards.slice(0, COLLAPSED_COUNT);
  const closeDialog = useCallback(() => setSelected(null), []);

  useEffect(() => {
    setSelected((current) => current ? cards.find((card) => card.projectId === current.projectId) ?? null : null);
  }, [cards]);

  if (!cards.length) return null;

  return (
    <section className={`${styles.section} ${styles[variant]}`} aria-label="촬영 진행 상황">
      <header className={styles.heading}>
        <div>
          <span>SHOOTING WORKFLOW</span>
          <h2>촬영 진행</h2>
        </div>
        <b>{cards.length}건</b>
      </header>
      <div className={styles.list}>
        {visibleCards.map((card) => {
          const content = (
            <>
              <div className={styles.cardTop}>
                <strong>{card.projectName}</strong>
                <span className={`${styles.badge} ${styles[card.tone]}`}>{toneLabel(card)}</span>
              </div>
              <p className={styles.detail}>{card.detail}</p>
              <div className={styles.progress} aria-label={`촬영 진행률 ${card.progressPercent}%`}>
                <span style={{ width: `${card.progressPercent}%` }} />
              </div>
              <div className={styles.currentStep}>
                <span>{card.stageLabel}</span>
                <p>{card.summary}</p>
              </div>
            </>
          );
          return (
            <button
              type="button"
              className={`${styles.card} ${card.actionRequired ? styles.cardAttention : ""}`}
              data-project-id={card.projectId}
              key={card.projectId}
              onClick={() => onOpen ? onOpen(card) : setSelected(card)}
            >
              {content}
            </button>
          );
        })}
      </div>
      {cards.length > COLLAPSED_COUNT ? (
        <button type="button" className={styles.expand} onClick={() => setExpanded((current) => !current)}>
          {expanded ? <><ChevronUp size={15} />접기</> : <><ChevronDown size={15} />나머지 {cards.length - COLLAPSED_COUNT}건 보기</>}
        </button>
      ) : null}
      {selected ? <ShootingProgressDialog card={selected} variant={variant} onClose={closeDialog} onUpdated={onUpdated} onOpenFolder={onOpenFolder} onOpenClient={onOpenClient} /> : null}
    </section>
  );
}
