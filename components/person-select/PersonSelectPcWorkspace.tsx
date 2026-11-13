"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { resolveClassicSelectionShortcut } from "@/lib/person-select/classicSelection";
import type { SelectionSyncPatch } from "@/lib/person-select/selectionSync";
import { FinalSelectionSubmitDialog } from "./FinalSelectionSubmitDialog";
import { PersonSelectFilmstripImages } from "./PersonSelectFilmstripImages";
import { PersonSelectOfferNotice } from "./PersonSelectOfferNotice";
import { usePersonChoiceSync, type PersonSelectImageData } from "./usePersonChoiceSync";
import { isPersonSelectImagePageNearEnd, usePersonSelectImages } from "./usePersonSelectImages";
import {
  PERSON_SELECT_FIRST_PHOTO_TIMER_KEY,
  formatPersonSelectWon,
  isPersonSelectCategoryComplete,
  personSelectFinalReviewData,
  personSelectNeedMessage,
  shortPersonSelectFileName,
  type PersonSelectMeData,
} from "./personSelectPublicModel";
import { personSelectJsonFetch, personSelectionSyncStatus } from "./usePersonSelectPublicData";
import styles from "./PersonSelectPublic.module.css";

export function PersonSelectPcWorkspace({ slug, me, activeKey, pendingSyncCount }: {
  slug: string;
  me: PersonSelectMeData;
  activeKey: string;
  pendingSyncCount: number;
}) {
  const categories = me.categories
    .filter((item) => item.image_count > 0)
    .filter((item) => item.key !== "homeroom" || Boolean(me.person.group_label));
  const active = categories.find((item) => item.key === activeKey) ?? categories[0];
  const seedImages = useMemo<PersonSelectImageData[]>(() => (active?.choices ?? []).map((choice) => ({
    id: choice.image_id,
    original_file_name: choice.original_file_name,
    thumb_url: choice.thumb_url ?? "",
    preview_url: "",
    width: null,
    height: null,
  })), [active?.choices]);
  const { images, hasMore, loadMore, ensurePreviews } = usePersonSelectImages(slug, active?.key ?? "profile", seedImages);
  const [previewId, setPreviewId] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const firstPhotoMeasured = useRef(false);
  const serverChoices = active?.choices;
  const need = active?.need ?? 0;
  const limit = Math.max(1, active?.max || active?.pick || 1);
  const sync = usePersonChoiceSync({
    slug,
    categoryKey: active?.key ?? "profile",
    initialChoices: serverChoices ?? [],
    images,
    enabled: Boolean(active && !me.event.locked),
  });
  const displayedChoices = sync.displayedChoices;
  const chosen = displayedChoices;
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const imageIndexById = useMemo(() => new Map(images.map((image, index) => [image.id, index])), [images]);
  const choiceByImageId = useMemo(() => new Map(displayedChoices.map((choice) => [choice.image_id, choice])), [displayedChoices]);
  const chosenIds = useMemo(() => new Set(displayedChoices.map((item) => item.image_id)), [displayedChoices]);

  useEffect(() => {
    setPreviewId((current) => imageById.has(current) ? current : (serverChoices?.[0]?.image_id || images[0]?.id || ""));
  }, [activeKey, imageById, images, serverChoices]);

  const preview = imageById.get(previewId) ?? images[0];
  const previewIndex = preview ? imageIndexById.get(preview.id) ?? -1 : -1;
  const previewChoice = preview ? choiceByImageId.get(preview.id) ?? null : null;

  useEffect(() => {
    setKeys(previewChoice?.retouch_keys ?? []);
    setMemo(previewChoice?.memo ?? "");
  }, [previewChoice?.id, preview?.id]);

  const save = useCallback((imageId: string, nextKeys: string[], nextMemo: string) => {
    if (!active || !imageById.has(imageId)) return;
    const patches: SelectionSyncPatch[] = [];
    if (limit === 1) for (const selectedId of chosenIds) if (selectedId !== imageId) patches.push({ imageId: selectedId, selected: false });
    if (limit > 1 && chosenIds.size >= limit && !chosenIds.has(imageId)) return;
    patches.push({ imageId, selected: true }, { imageId, retouchKeys: nextKeys }, { imageId, memo: nextMemo });
    sync.enqueue(patches);
    if (imageId === preview?.id) { setKeys(nextKeys); setMemo(nextMemo); }
  }, [active, chosenIds, imageById, limit, preview?.id, sync]);

  const clearChoice = useCallback((imageId: string) => {
    if (!active) return;
    sync.enqueue([{ imageId, selected: false }]);
  }, [active, sync]);

  function schedule(nextKeys: string[], nextMemo: string) {
    if (!previewChoice?.image_id) return;
    sync.enqueue([
      { imageId: previewChoice.image_id, retouchKeys: nextKeys },
      { imageId: previewChoice.image_id, memo: nextMemo },
    ]);
  }

  useEffect(() => {
    if (previewIndex < 0) return;
    const ids = [-2, -1, 0, 1, 2].flatMap((offset) => images[previewIndex + offset]?.id ? [images[previewIndex + offset].id] : []);
    void ensurePreviews(ids);
  }, [ensurePreviews, images, previewIndex]);

  useEffect(() => {
    if (hasMore && isPersonSelectImagePageNearEnd(previewIndex, images.length)) void loadMore();
  }, [hasMore, images.length, loadMore, previewIndex]);

  useEffect(() => {
    const filmstrip = filmstripRef.current;
    const thumbnail = activeThumbRef.current;
    if (!filmstrip || !thumbnail) return;
    filmstrip.scrollTo({
      left: thumbnail.offsetLeft - (filmstrip.clientWidth - thumbnail.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [previewId]);

  useEffect(() => {
    const filmstrip = filmstripRef.current;
    if (!filmstrip) return;
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      filmstrip.scrollLeft += event.deltaY;
    };
    filmstrip.addEventListener("wheel", handleWheel, { passive: false });
    return () => filmstrip.removeEventListener("wheel", handleWheel);
  }, []);

  const full = limit > 1 && displayedChoices.length >= limit;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!preview || event.repeat
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); setPreviewId(images[Math.max(0, previewIndex - 1)]?.id ?? preview.id); }
      if (event.key === "ArrowRight") { event.preventDefault(); setPreviewId(images[Math.min(images.length - 1, previewIndex + 1)]?.id ?? preview.id); }
      if (event.key === " ") { event.preventDefault(); if (!chosenIds.has(preview.id) && !full) save(preview.id, [], ""); }
      const shortcut = resolveClassicSelectionShortcut(event.key);
      if (shortcut === "select") {
        event.preventDefault();
        if (!chosenIds.has(preview.id) && !full && !me.event.locked) save(preview.id, [], "");
      }
      if (shortcut === "clear") {
        event.preventDefault();
        if (chosenIds.has(preview.id) && !me.event.locked) clearChoice(preview.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chosenIds, clearChoice, full, images, me.event.locked, preview, previewIndex, save]);

  if (!active) return null;
  const required = categories.filter((item) => item.need > 0);
  const missing = required.find((item) => item.key === active.key
    ? chosen.length < item.need || chosen.length > Math.max(item.need, item.max)
    : !isPersonSelectCategoryComplete(item));
  const reviewCategories = categories.map((category) => category.key === active.key ? { ...category, choices: chosen } : category);
  const review = personSelectFinalReviewData(reviewCategories);

  async function openSubmitReview() {
    setSubmitError("");
    if (pendingSyncCount || sync.pendingCount || !(await sync.flushNow())) {
      setSubmitError("저장되지 않은 변경을 먼저 저장해 주세요.");
      return;
    }
    setSubmitReviewOpen(true);
  }

  async function confirmSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await personSelectJsonFetch(`/api/pick/${slug}/submit`, { method: "POST", body: JSON.stringify({ confirmed: true }) });
      window.location.href = `/pick/${slug}/done`;
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "제출하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  function scrollFilmstrip(direction: -1 | 1) {
    const filmstrip = filmstripRef.current;
    if (!filmstrip) return;
    filmstrip.scrollBy({ left: direction * filmstrip.clientWidth, behavior: "smooth" });
    if (direction > 0 && hasMore) void loadMore();
  }

  const loadMoreNearFilmstripEnd = useCallback(() => {
    const filmstrip = filmstripRef.current;
    if (!filmstrip || !hasMore) return;
    if (filmstrip.scrollWidth - filmstrip.scrollLeft - filmstrip.clientWidth < 800) void loadMore();
  }, [hasMore, loadMore]);

  const selectPreview = useCallback((imageId: string) => setPreviewId(imageId), []);

  function measureFirstPhoto() {
    if (firstPhotoMeasured.current) return;
    firstPhotoMeasured.current = true;
    const startedAt = Number(window.sessionStorage.getItem(PERSON_SELECT_FIRST_PHOTO_TIMER_KEY));
    if (!Number.isFinite(startedAt) || startedAt <= 0) return;
    const milliseconds = Date.now() - startedAt;
    window.sessionStorage.removeItem(PERSON_SELECT_FIRST_PHOTO_TIMER_KEY);
    console.info(`[person-select] 로그인 후 첫 사진 표시: ${milliseconds}ms`);
  }

  const missingText = missing
    ? missing.key === active.key
      ? personSelectNeedMessage({ ...missing, choices: chosen })
      : personSelectNeedMessage(missing)
    : "";

  return <section className={styles.pcWorkspace}>
    <div className={styles.pcBody}>
      <div className={styles.pcPhotos}>
        <div className={styles.pcPreview}>
          <div className={styles.preview}>
            {preview ? <img src={preview.preview_url || preview.thumb_url} alt={preview.original_file_name} onLoad={measureFirstPhoto} draggable={false} onContextMenu={(event) => event.preventDefault()} /> : <span className={styles.pcPhotoEmpty}>아직 올라온 사진이 없어요. 포토클리닉에 문의해 주세요.</span>}
            <div className={styles.pcPreviewInfo}><strong title={preview?.original_file_name}>{preview ? shortPersonSelectFileName(preview.original_file_name) : "사진 없음"}</strong><span>{preview ? `${previewIndex + 1} / ${images.length}` : `0 / ${images.length}`}</span></div>
            <button className={`${styles.pcNavButton} ${styles.pcNavPrevious}`} disabled={previewIndex <= 0} onClick={() => setPreviewId(images[previewIndex - 1]?.id ?? preview?.id ?? "")} aria-label="이전 사진"><ChevronLeft size={20} /></button>
            <button className={`${styles.pcNavButton} ${styles.pcNavNext}`} disabled={previewIndex < 0 || previewIndex >= images.length - 1} onClick={() => setPreviewId(images[previewIndex + 1]?.id ?? preview?.id ?? "")} aria-label="다음 사진"><ChevronRight size={20} /></button>
            {previewChoice
              ? <button className={`${styles.pcSelectButton} ${styles.pcSelectButtonSelected}`} disabled={me.event.locked} onClick={() => clearChoice(previewChoice.image_id)} title="선택 해제"><Check size={16} aria-hidden="true" />선택됨</button>
              : <button className={styles.pcSelectButton} disabled={!preview || me.event.locked || full} title={full ? `${limit}장까지 고를 수 있어요. 다른 사진을 먼저 빼주세요.` : undefined} onClick={() => preview && save(preview.id, [], "")}>{full ? `${limit}장 모두 골랐어요` : `이 사진 고르기${limit > 1 ? ` (${chosen.length}/${need})` : ""}`}</button>}
          </div>
        </div>
        <div className={styles.pcFilmstrip}>
          <button className={`${styles.pcFilmstripArrow} ${styles.pcFilmstripPrevious}`} type="button" aria-label="이전 사진 묶음" onClick={() => scrollFilmstrip(-1)}><ChevronLeft size={20} /></button>
          <PersonSelectFilmstripImages
            images={images}
            previewId={preview?.id ?? ""}
            selectedIds={chosenIds}
            pendingImageIds={sync.pendingImageIds}
            activeThumbRef={activeThumbRef}
            filmstripRef={filmstripRef}
            onSelect={selectPreview}
            onScroll={loadMoreNearFilmstripEnd}
          />
          <button className={`${styles.pcFilmstripArrow} ${styles.pcFilmstripNext}`} type="button" aria-label="다음 사진 묶음" onClick={() => scrollFilmstrip(1)}><ChevronRight size={20} /></button>
        </div>
        <p className={styles.pcKeyboardHint}>← → 사진 이동 · 1 선택 · 0 해제 · Space 사진 고르기</p>
      </div>
      <aside className={styles.pcFeedback}>
        <div className={styles.pcFeedbackScroll}>
          <PersonSelectOfferNotice me={me} />
          <p className={styles.eyebrow}>보정 요청 · {active.label}{need > 1 ? ` · 고른 사진 ${chosen.length}/${need}` : ""}</p>
          {previewChoice ? <>
            <div className={styles.pcChosenPhoto}><img src={previewChoice.thumb_url || ""} alt="고른 사진" decoding="async" draggable={false} onContextMenu={(event) => event.preventDefault()} /><div><strong title={previewChoice.original_file_name}>{shortPersonSelectFileName(previewChoice.original_file_name)}</strong><p className={styles.autoSave}>{personSelectionSyncStatus(sync)}</p></div></div>
            <div className={styles.field}><label>보정 체크리스트</label><div className={styles.chipGrid}>{me.event.retouch_options.map((option) => { const selected = keys.includes(option.key); return <button key={option.key} aria-pressed={selected} className={`${styles.chip} ${selected ? styles.chipActive : ""}`} onClick={() => { const next = selected ? keys.filter((key) => key !== option.key) : [...keys, option.key]; setKeys(next); schedule(next, memo); }}>{option.label}</button>; })}</div></div>
            <div className={styles.field}><label>메모</label><textarea className={styles.textarea} maxLength={me.event.memo_max} value={memo} onChange={(event) => { setMemo(event.target.value); schedule(keys, event.target.value); }} /><span className={styles.counter}>{memo.length} / {me.event.memo_max}</span></div>
          </> : <div className={styles.pcFeedbackEmpty}>{chosen.length ? "고른 사진(체크 표시)을 누르면 그 사진의 보정 요청을 적을 수 있어요." : "왼쪽에서 사진을 먼저 골라주세요."}</div>}
          {need > 1 && displayedChoices.length ? <div className={styles.pcThumbs} style={{ marginTop: 14, flexWrap: "wrap", height: "auto", padding: 0, overflow: "visible" }}>{displayedChoices.map((item) => <button key={item.image_id} className={`${styles.photoTile} ${item.image_id === preview?.id ? styles.pcThumbCurrent : ""} ${styles.photoTileSelected} ${sync.pendingImageIds.has(item.image_id) ? styles.photoTilePending : ""}`} onClick={() => setPreviewId(item.image_id)} title={item.original_file_name}><img src={item.thumb_url || ""} alt={item.original_file_name} decoding="async" draggable={false} onContextMenu={(event) => event.preventDefault()} /><span className={styles.check}><Check size={15} /></span>{sync.pendingImageIds.has(item.image_id) ? <span className={styles.pendingDot} aria-label="저장 안 된 변경" /> : null}</button>)}</div> : null}
        </div>
        <div className={styles.pcSubmitArea}>{(me.event.offers ?? []).length || me.event.extra_price ? <a className={styles.pcOrderLink} href={`/pick/${slug}/order`}><ShoppingBag size={15} /><span>추가 주문{me.order?.lines.length ? ` · ${me.order.lines.map((line) => line.label).join(", ")}` : " · 추가 보정·액자·앨범"}</span><strong>{me.order?.total ? formatPersonSelectWon(me.order.total) : "신청하기"}</strong></a> : null}<p className={styles.autoSave}>{pendingSyncCount ? `저장 안 된 변경 ${pendingSyncCount}건 · 다시 시도` : personSelectionSyncStatus(sync)}</p>{missing || submitError ? <p className={styles.submitReason}>{submitError || missingText}</p> : null}<button className={styles.primary} disabled={Boolean(missing) || me.event.locked || pendingSyncCount > 0 || sync.pendingCount > 0 || sync.status !== "saved"} onClick={() => void openSubmitReview()}>제출하기</button></div>
      </aside>
    </div>
    {submitReviewOpen ? <FinalSelectionSubmitDialog selectedCount={review.selectedCount} sections={review.sections} items={review.items} busy={submitting} error={submitError} onCancel={() => { if (!submitting) setSubmitReviewOpen(false); }} onConfirm={() => void confirmSubmit()} /> : null}
  </section>;
}
