"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { SelectionSyncPatch } from "@/lib/person-select/selectionSync";
import {
  formatPersonSelectWon as won,
  isPersonSelectCategoryComplete as isComplete,
  personSelectExtraCount as extraCount,
} from "./personSelectPublicModel";
import { PersonSelectPhotoTile } from "./PersonSelectPhotoTile";
import { usePersonChoiceSync, type PersonSelectImageData as ImageData } from "./usePersonChoiceSync";
import { usePersonSelectImages } from "./usePersonSelectImages";
import {
  personSelectionSyncStatus as selectionSyncStatus,
  usePersonSelectData as useSelectionData,
} from "./usePersonSelectPublicData";
import styles from "./PersonSelectPublic.module.css";

export function PersonSelectMobileCategory({ slug, categoryKey }: { slug: string; categoryKey: string }) {
  const router = useRouter();
  const { me, loading: meLoading, error } = useSelectionData(slug);
  const category = me?.categories.find((item) => item.key === categoryKey);
  const seedImages = useMemo<ImageData[]>(() => (category?.choices ?? []).map((choice) => ({
    id: choice.image_id,
    original_file_name: choice.original_file_name,
    thumb_url: choice.thumb_url ?? "",
    preview_url: "",
    width: null,
    height: null,
  })), [category?.choices]);
  const { images, loading, loadingMore, pageError, hasMore, loadMore, ensurePreviews } = usePersonSelectImages(slug, categoryKey, seedImages);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [message, setMessage] = useState("");
  const photoGridEndRef = useRef<HTMLDivElement | null>(null);
  const sync = usePersonChoiceSync({
    slug,
    categoryKey,
    initialChoices: category?.choices ?? [],
    images,
    enabled: Boolean(me && category && !me.event.locked),
  });

  useEffect(() => {
    if (previewIndex === null) return;
    const ids = [-2, -1, 0, 1, 2].flatMap((offset) => images[previewIndex + offset]?.id ? [images[previewIndex + offset].id] : []);
    void ensurePreviews(ids);
  }, [ensurePreviews, images, previewIndex]);

  useEffect(() => {
    const node = photoGridEndRef.current;
    if (!node || filter !== "all" || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "900px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [filter, hasMore, loadMore]);

  const displayedIds = useMemo(() => new Set(sync.displayedChoices.map((choice) => choice.image_id)), [sync.displayedChoices]);
  const imageIndexById = useMemo(() => new Map(images.map((image, index) => [image.id, index])), [images]);
  const openPreview = useCallback((imageId: string) => {
    const index = imageIndexById.get(imageId);
    if (index !== undefined) setPreviewIndex(index);
  }, [imageIndexById]);

  if (meLoading || loading) return <main className={styles.darkPage}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  if (!me || !category) return <main className={styles.darkPage}><div className={styles.done}>{error || "항목을 찾을 수 없어요."}</div></main>;
  const currentMe = me;
  const currentCategory = category;
  const visibleChoices = sync.displayedChoices;
  const visibleCategory = { ...currentCategory, choices: visibleChoices };

  function choose(imageId: string) {
    if (currentMe.event.locked) return;
    setMessage("");
    const limit = Math.max(1, currentCategory.max || currentCategory.pick || 1);
    const patches: SelectionSyncPatch[] = [];
    if (limit === 1) for (const selectedId of displayedIds) if (selectedId !== imageId) patches.push({ imageId: selectedId, selected: false });
    if (limit > 1 && displayedIds.size >= limit && !displayedIds.has(imageId)) { setMessage(`${limit}장까지 고를 수 있어요.`); return; }
    patches.push({ imageId, selected: true }, { imageId, retouchKeys: [] }, { imageId, memo: "" });
    sync.enqueue(patches);
  }

  function clearChoice(imageId: string) {
    if (currentMe.event.locked) return;
    setMessage("");
    sync.enqueue([{ imageId, selected: false }]);
  }

  const shown = filter === "selected" ? images.filter((image) => displayedIds.has(image.id)) : images;
  const preview = previewIndex === null ? null : images[previewIndex];
  const count = visibleChoices.length;
  const extra = extraCount(visibleCategory);
  const dockText = message || (count === 0 ? `사진을 ${category.need}장 골라주세요${category.max > category.need ? ` · ${category.max}장까지 더 고를 수 있어요` : ""}` : extra && me.event.extra_price ? `${count}장 골랐어요 · 추가 보정 ${extra}장 ${won(extra * me.event.extra_price)}` : isComplete(visibleCategory) ? "고른 사진의 보정 요청을 적어주세요." : `${count} / ${category.need}장 골랐어요`);

  return <main className={styles.darkPage}>
    <header className={styles.darkTop}><button onClick={() => { void sync.flushNow().then((saved) => { if (saved) router.push(`/pick/${slug}/home`); }); }} aria-label="뒤로"><ArrowLeft /></button><strong>{category.label}</strong><span>{category.image_count}장</span></header>
    <div className={styles.subtabs}><button className={`${styles.subtab} ${filter === "all" ? styles.subtabActive : ""}`} onClick={() => setFilter("all")}>전체 {category.image_count}</button><button className={`${styles.subtab} ${filter === "selected" ? styles.subtabActive : ""}`} onClick={() => setFilter("selected")}>고른 사진 {count} / {category.need}{category.max > category.need ? `+` : ""}</button></div>
    {images.length === 0 ? <div className={styles.done}>아직 올라온 사진이 없어요. 포토클리닉에 문의해 주세요.</div> : <div className={styles.photoGrid}>{shown.map((image) => <PersonSelectPhotoTile key={image.id} image={image} selected={displayedIds.has(image.id)} pending={sync.pendingImageIds.has(image.id)} onOpen={openPreview} />)}{filter === "all" ? <div ref={photoGridEndRef} className={styles.photoLoadSentinel}>{loadingMore ? "사진을 더 불러오는 중…" : pageError ? <button type="button" onClick={() => void loadMore()}>{pageError} · 다시 시도</button> : null}</div> : null}</div>}
    <div className={styles.darkDock}><p>{message || selectionSyncStatus(sync)}{message ? "" : ` · ${dockText}`}</p><button className={styles.mintButton} disabled={count === 0 || me.event.locked || sync.pendingCount > 0} onClick={() => { void sync.flushNow().then((saved) => { if (saved) router.push(`/pick/${slug}/c/${categoryKey}/feedback`); }); }}>고른 사진 보정 요청 쓰기</button></div>
    {preview ? <div className={styles.lightbox}>
      <div className={styles.lightboxTop}><button className={styles.iconButton} onClick={() => setPreviewIndex(null)} aria-label="뒤로"><ArrowLeft /></button><strong>{(previewIndex ?? 0) + 1} / {images.length}</strong><button className={styles.iconButton} onClick={() => setPreviewIndex(null)} aria-label="닫기"><X size={20} strokeWidth={2} /></button></div>
      <div className={styles.preview}><img src={preview.preview_url || preview.thumb_url} alt={preview.original_file_name} draggable={false} onContextMenu={(event) => event.preventDefault()} /><div className={styles.previewNav}><button className={styles.iconButton} disabled={!previewIndex} onClick={() => setPreviewIndex(Math.max(0, (previewIndex ?? 0) - 1))}><ChevronLeft /></button><button className={styles.iconButton} disabled={previewIndex === images.length - 1} onClick={() => setPreviewIndex(Math.min(images.length - 1, (previewIndex ?? 0) + 1))}><ChevronRight /></button></div></div>
      <div className={styles.lightboxActions}>{displayedIds.has(preview.id) ? <button className={styles.secondary} onClick={() => clearChoice(preview.id)}>선택 해제</button> : <button className={styles.secondary} onClick={() => choose(preview.id)}>이 사진 고르기 ({count}/{category.need})</button>}<button className={styles.mintButton} disabled={count === 0 || sync.pendingCount > 0} onClick={() => { void sync.flushNow().then((saved) => { if (saved) router.push(`/pick/${slug}/c/${categoryKey}/feedback`); }); }}>보정 요청 쓰기</button></div>
    </div> : null}
  </main>;
}
