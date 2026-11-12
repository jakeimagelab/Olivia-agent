"use client";

import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { formatWon } from "@/lib/person-select/core";
import type { PersonSelectAdminChoice, PersonSelectAdminPerson } from "@/lib/person-select/adminPerson";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

export function toggleRetouchKey(keys: string[], key: string) {
  return keys.includes(key) ? keys.filter((current) => current !== key) : [...keys, key];
}

export function PersonDetailDrawer({ person, personWord, eventId, labels, categoryLabels, options, onClose, onSaved, onPin }: {
  person: PersonSelectAdminPerson;
  personWord: string;
  eventId: string;
  labels: Map<string, string>;
  categoryLabels: Map<string, string>;
  options: { key: string; label: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onPin: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [keys, setKeys] = useState<string[]>([]);

  async function save(choice: PersonSelectAdminChoice) {
    const response = await fetch(`/api/person-select/${eventId}/choices/${choice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retouch_keys: keys, memo }),
    });
    if (!response.ok) return;
    setEditing(null);
    await onSaved();
  }

  return <div className={styles.drawerBackdrop} onClick={onClose}>
    <aside className={styles.drawer} onClick={(event) => event.stopPropagation()}>
      <div className={styles.drawerTop}><div><p className={styles.eyebrow}>상세</p><h2>{person.display_name}{personWord ? ` ${personWord}` : ""}</h2></div><button className={styles.weak} onClick={onClose}><X /></button></div>
      {person.choices.map((choice) => <section className={styles.choiceDetail} key={choice.id}>
        {choice.person_select_images ? <img src={choice.person_select_images.thumb_url} alt="고른 사진" /> : null}
        <h3>{categoryLabels.get(choice.category_key) ?? choice.category_key}</h3>
        <p>{choice.person_select_images?.original_file_name}</p>
        {editing === choice.id ? <>
          <div className={styles.chipGrid}>{options.map((option) => <button key={option.key} className={`${styles.chip} ${keys.includes(option.key) ? styles.chipActive : ""}`} onClick={() => setKeys(toggleRetouchKey(keys, option.key))}>{option.label}</button>)}</div>
          <textarea className={styles.textarea} value={memo} onChange={(event) => setMemo(event.target.value)} />
          <div className={styles.actions} style={{ justifyContent: "flex-start", marginTop: 10 }}><button className={styles.primary} onClick={() => void save(choice)}>관리자 수정 저장</button><button className={styles.secondary} onClick={() => setEditing(null)}>취소</button></div>
        </> : <>
          <p>{choice.retouch_keys.map((key) => labels.get(key) || key).join(" / ") || "기본 보정"}</p>
          <p>{choice.memo || "메모 없음"}</p>
          <button className={styles.secondary} onClick={() => { setEditing(choice.id); setKeys(choice.retouch_keys); setMemo(choice.memo); }}>관리자 수정</button>
        </>}
      </section>)}
      {person.order?.lines.length ? <section className={styles.choiceDetail}><h3>추가 주문 · {formatWon(person.order.total)}</h3>{person.order.lines.map((line, index) => <p key={index}>{line.label}{line.detail ? ` · ${line.detail}` : ""} — {line.qty} × {formatWon(line.unitPrice)} = {formatWon(line.amount)}</p>)}</section> : null}
      <button className={styles.secondary} style={{ marginTop: 18 }} onClick={() => void onPin()}><RefreshCw size={15} style={{ verticalAlign: -3, marginRight: 5 }} />PIN 재발급</button>
    </aside>
  </div>;
}
