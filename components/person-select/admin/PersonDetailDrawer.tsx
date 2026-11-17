"use client";

import { useState } from "react";
import { RefreshCw, Trash2, X } from "lucide-react";
import { formatWon } from "@/lib/person-select/format";
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
  const [deletingDeliveryId, setDeletingDeliveryId] = useState<string | null>(null);
  const [deliveryDeleteError, setDeliveryDeleteError] = useState("");

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

  async function deleteDelivery(delivery: NonNullable<PersonSelectAdminPerson["deliveries"]>[number]) {
    const confirmed = window.confirm(`${delivery.display_name} 보정본을 삭제할까요?\n모든 버전과 업로드 파일이 영구 삭제되며 복구할 수 없습니다.`);
    if (!confirmed) return;
    setDeletingDeliveryId(delivery.id);
    setDeliveryDeleteError("");
    try {
      const response = await fetch(`/api/person-select/${eventId}/deliveries/${delivery.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "보정본을 삭제하지 못했습니다.");
      await onSaved();
    } catch (error) {
      setDeliveryDeleteError(error instanceof Error ? error.message : "보정본을 삭제하지 못했습니다.");
    } finally {
      setDeletingDeliveryId(null);
    }
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
      {person.deliveries?.length ? <section className={styles.choiceDetail}>
        <h3>보정본 · {person.deliveries.length}장</h3>
        <div className={styles.deliveryPreviewList}>{person.deliveries.map((delivery) => <article key={delivery.id}>
          {delivery.preview_url ? <img src={delivery.preview_url} alt={delivery.display_name} loading="lazy" /> : <span className={styles.matchingPhotoEmpty}>미리보기 없음</span>}
          <div><strong>{delivery.display_name}</strong><p>v{delivery.current_version} · {delivery.status === "revision_requested" ? "수정 요청" : delivery.status === "revised" ? "수정됨" : delivery.status === "approved" ? "확인 완료" : "확인 전"}</p>{delivery.customer_memo ? <small>{delivery.customer_memo}</small> : null}</div>
          <button type="button" className={styles.deliveryDeleteButton} disabled={Boolean(deletingDeliveryId)} aria-label={`${delivery.display_name} 보정본 삭제`} title="보정본 삭제" onClick={() => void deleteDelivery(delivery)}><Trash2 size={15} aria-hidden="true" /></button>
        </article>)}</div>
        {deliveryDeleteError ? <p className={styles.deliveryDeleteError} role="alert">{deliveryDeleteError}</p> : null}
      </section> : null}
      {person.order?.lines.length ? <section className={styles.choiceDetail}><h3>추가 주문 · {formatWon(person.order.total)}</h3>{person.order.lines.map((line, index) => <p key={index}>{line.label}{line.detail ? ` · ${line.detail}` : ""} — {line.qty} × {formatWon(line.unitPrice)} = {formatWon(line.amount)}</p>)}</section> : null}
      <button className={styles.secondary} style={{ marginTop: 18 }} onClick={() => void onPin()}><RefreshCw size={15} style={{ verticalAlign: -3, marginRight: 5 }} />PIN 재발급</button>
    </aside>
  </div>;
}
