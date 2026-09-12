"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { DerivedContiChecklistItem } from "@/lib/conti/deriveChecklist";
import styles from "@/components/conti/v2/ContiV2.module.css";

export default function ContiCompactChecklist({ items, onToggle, onAdd }: { items: DerivedContiChecklistItem[]; onToggle: (id: string) => void; onAdd: (label: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const completed = items.filter((item) => item.completed).length;
  function add() {
    if (!draft.trim()) return;
    onAdd(draft); setDraft("");
  }
  return (
    <section className={`${styles.compactPanel} ${expanded ? styles.compactPanelExpanded : ""}`}>
      <header className={styles.compactHeader}>
        <div><span>준비사항</span><strong>{completed} / {items.length} 완료</strong></div>
        <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "접기" : "전체보기"}<ChevronDown size={13} style={{ transform: expanded ? "rotate(180deg)" : undefined }} /></button>
      </header>
      <div className={styles.compactList}>
        {items.length ? items.map((item) => (
          <label key={item.id} className={`${styles.checklistItem} ${item.completed ? styles.checklistItemDone : ""}`}>
            <input type="checkbox" checked={item.completed} onChange={() => onToggle(item.id)} />
            <span className={styles.checkMark}><Check size={12} /></span>
            <span className={styles.checklistLabel}>{item.label}<small>{item.linkedSceneIds.length ? `${item.linkedSceneIds.length}개 Scene` : "직접 추가"}</small></span>
          </label>
        )) : <p className={styles.compactEmpty}>Scene 준비사항을 입력하면 자동으로 정리됩니다.</p>}
      </div>
      <div className={styles.compactAdd}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="준비사항 추가" />
        <button type="button" onClick={add} aria-label="준비사항 추가"><Plus size={14} /></button>
      </div>
    </section>
  );
}
