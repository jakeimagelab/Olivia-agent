"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import type { SelectionSyncPatch } from "@/lib/person-select/selectionSync";
import { shortPersonSelectFileName as shortFileName } from "./personSelectPublicModel";
import { usePersonChoiceSync, type PersonSelectImageData as ImageData } from "./usePersonChoiceSync";
import {
  personSelectionSyncStatus as selectionSyncStatus,
  usePersonSelectData as useSelectionData,
} from "./usePersonSelectPublicData";
import styles from "./PersonSelectPublic.module.css";

export function PersonSelectFeedback({ slug, categoryKey }: { slug: string; categoryKey: string }) {
  const router = useRouter();
  const { me, loading, error } = useSelectionData(slug);
  const category = me?.categories.find((item) => item.key === categoryKey);
  const [drafts, setDrafts] = useState<Record<string, { keys: string[]; memo: string }>>({});
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const syncImages = useMemo<ImageData[]>(() => (category?.choices ?? []).map((choice) => ({
    id: choice.image_id,
    original_file_name: choice.original_file_name,
    thumb_url: choice.thumb_url ?? "",
    preview_url: choice.thumb_url ?? "",
    width: null,
    height: null,
  })), [category?.choices]);
  const sync = usePersonChoiceSync({
    slug,
    categoryKey,
    initialChoices: category?.choices ?? [],
    images: syncImages,
    enabled: Boolean(me && category && !me.event.locked),
  });

  useEffect(() => {
    if (!category) return;
    setDrafts(Object.fromEntries(category.choices.map((choice) => [choice.id, { keys: choice.retouch_keys, memo: choice.memo }])));
  }, [category]);

  if (loading) return <main className={styles.page}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  if (!me || !category || category.choices.length === 0) return <main className={styles.page}><div className={styles.done}>{error || "사진을 먼저 골라주세요."}</div></main>;
  const currentCategory = category;

  function update(choiceId: string, patch: Partial<{ keys: string[]; memo: string }>) {
    setDrafts((current) => ({ ...current, [choiceId]: { keys: current[choiceId]?.keys ?? [], memo: current[choiceId]?.memo ?? "", ...patch } }));
  }

  async function save() {
    setBusy(true);
    try {
      sync.enqueue(currentCategory.choices.flatMap((choice) => {
        const draft = drafts[choice.id] ?? { keys: choice.retouch_keys, memo: choice.memo };
        return [
          { imageId: choice.image_id, retouchKeys: draft.keys },
          { imageId: choice.image_id, memo: draft.memo },
        ] satisfies SelectionSyncPatch[];
      }));
      if (!(await sync.flushNow())) throw new Error("저장되지 않은 변경이 있습니다.");
      router.push(`/pick/${slug}/home`);
    } catch {
      setToast("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}><button className={styles.weak} onClick={() => router.back()}><ArrowLeft /></button><strong>보정 요청</strong><span style={{ width: 44 }} /></header>
    <section className={styles.feedbackContent}><p className={styles.eyebrow}>{category.label} · {category.choices.length}장</p><h1>보정 요청을 남겨주세요.</h1><p className={styles.muted}>사진마다 원하는 항목을 여러 개 고를 수 있어요.</p>
      {category.choices.map((choice, index) => {
        const draft = drafts[choice.id] ?? { keys: choice.retouch_keys, memo: choice.memo };
        return <div key={choice.id}>
          <div className={styles.selectedCard}><img src={choice.thumb_url || ""} alt="고른 사진" draggable={false} onContextMenu={(event) => event.preventDefault()} /><div><strong>{shortFileName(choice.original_file_name)}</strong><p className={styles.muted}>고른 사진 {category.choices.length > 1 ? `${index + 1}` : ""}</p></div>{index === 0 ? <button className={styles.secondary} onClick={() => router.push(`/pick/${slug}/c/${categoryKey}`)}>다른 사진 고르기</button> : null}</div>
          <div className={styles.field}><label>보정 체크리스트</label><div className={styles.chipGrid}>{me.event.retouch_options.map((option) => { const active = draft.keys.includes(option.key); return <button type="button" key={option.key} aria-pressed={active} className={`${styles.chip} ${active ? styles.chipActive : ""}`} onClick={() => update(choice.id, { keys: active ? draft.keys.filter((key) => key !== option.key) : [...draft.keys, option.key] })}>{active ? <Check size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> : null}{option.label}</button>; })}</div></div>
          <div className={styles.field}><label htmlFor={`pick-memo-${choice.id}`}>메모</label><textarea id={`pick-memo-${choice.id}`} className={styles.textarea} maxLength={me.event.memo_max} value={draft.memo} onChange={(event) => update(choice.id, { memo: event.target.value })} placeholder="추가로 원하는 내용을 적어주세요." /><span className={styles.counter}>{draft.memo.length} / {me.event.memo_max}</span></div>
        </div>;
      })}
      <p className={styles.feedbackInfo}>아무것도 고르지 않으면 기본 보정(자연스럽게)으로 진행해요.</p>
    </section>
    <footer className={styles.feedbackDock}><div><button className={styles.primary} disabled={me.event.locked || busy} onClick={save}>저장하고 돌아가기</button><small>{selectionSyncStatus(sync)} · 최종 제출은 홈에서 해주세요.</small></div></footer>
    {toast ? <div className={styles.toast}>{toast}</div> : null}
  </main>;
}
