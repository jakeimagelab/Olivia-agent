"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, ImageIcon, LogOut, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { formatSeoulDeadline } from "@/lib/person-select/date";
import { offerImagesFor } from "@/lib/person-select/types";
import { type SelectionSyncPatch } from "@/lib/person-select/selectionSync";
import { usePersonChoiceSync, type PersonSelectImageData as ImageData } from "./usePersonChoiceSync";
import { clearPersonSelectImageCache, usePersonSelectImages } from "./usePersonSelectImages";
import { PersonSelectPhotoTile } from "./PersonSelectPhotoTile";
import { PersonSelectOfferNotice as OfferNotice } from "./PersonSelectOfferNotice";
import { PersonSelectPcWorkspace as PcWorkspace } from "./PersonSelectPcWorkspace";
import PersonSelectDeliveryReview from "./PersonSelectDeliveryReview";
import { FinalSelectionSubmitDialog } from "./FinalSelectionSubmitDialog";
import {
  formatPersonSelectWon as won,
  isPersonSelectCategoryComplete as isComplete,
  isSchoolPersonSelectEvent as isSchoolEvent,
  personSelectExtraCount as extraCount,
  personSelectFinalReviewData as finalReviewData,
  personSelectNeedMessage as needMessage,
  personSelectRetouchCount as retouchCount,
  PERSON_SELECT_FIRST_PHOTO_TIMER_KEY,
  shortPersonSelectFileName as shortFileName,
  type PersonSelectCategoryData as Category,
  type PersonSelectMeData as MeData,
  type PersonSelectOffer as Offer,
  type PersonSelectOrderItem as OrderItem,
  type PersonSelectOrderLine as OrderLine,
  type PersonSelectPublicEvent as PublicEvent,
} from "./personSelectPublicModel";
import {
  personSelectJsonFetch as jsonFetch,
  personSelectionSyncStatus as selectionSyncStatus,
  usePendingPersonChoiceSyncCount,
  usePersonSelectData as useSelectionData,
} from "./usePersonSelectPublicData";
import styles from "./PersonSelectPublic.module.css";

export function PersonSelectLogin({ slug, event }: { slug: string; event: PublicEvent | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const school = isSchoolEvent(event);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      clearPersonSelectImageCache(slug);
      window.sessionStorage.setItem(PERSON_SELECT_FIRST_PHOTO_TIMER_KEY, String(Date.now()));
      await jsonFetch(`/api/pick/${slug}/login`, { method: "POST", body: JSON.stringify({ name, pin }) });
      router.replace(`/pick/${slug}/home`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "이름 또는 비밀번호가 맞지 않아요."); }
    finally { setBusy(false); }
  }

  return <main className={styles.loginPage}>
    <section className={styles.loginShell}>
      <div className={styles.loginIntro}>
        <div>
          <div className={styles.mark}><ImageIcon size={22} /></div>
          <p className={styles.eyebrow}>{event?.title || "개인별 사진 셀렉"}</p>
          <h1>{school ? "선생님의 사진을 직접 골라주세요." : "내 사진을 직접 골라주세요."}</h1>
          <p>{school ? "졸업앨범에" : "앞으로"} 사용할 사진을 확인하고<br />원하는 보정 내용을 남길 수 있어요.</p>
        </div>
        <div className={styles.stepList}>
          <span><b>1</b> 이름과 비밀번호로 들어가기</span>
          <span><b>2</b> 정해진 장수만큼 사진 고르기</span>
          <span><b>3</b> 보정 요청을 남기고 제출하기</span>
        </div>
      </div>
      <form className={styles.loginForm} onSubmit={submit}>
        <p className={styles.eyebrow}>개인별 사진 셀렉</p>
        <h2>내 사진 보기</h2>
        <p className={styles.muted}>{school ? "학교에서" : "포토클리닉에서"} 받은 이름과 비밀번호 4자리를 입력해 주세요.</p>
        {event ? <p className={styles.loginDeadline}>마감 {formatSeoulDeadline(event.deadline_at)}</p> : null}
        {event?.status === "draft" ? <div className={styles.error}>아직 열리지 않았어요.</div> : null}
        <div className={styles.field}><label htmlFor="pick-name">이름</label><input id="pick-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={school ? "선생님 이름" : "이름"} /></div>
        <div className={styles.field}><label htmlFor="pick-pin">비밀번호</label><input id="pick-pin" className={`${styles.input} ${styles.pin}`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" /></div>
        {error ? <div className={styles.error}>{error}</div> : null}
        <button className={`${styles.primary} ${styles.loginButton}`} disabled={busy || event?.status === "draft" || !name.trim() || pin.length !== 4}>{busy ? "확인하는 중이에요" : "들어가기"}</button>
        <p className={styles.deadline}>{school ? "비밀번호를 잊었다면 학교 담당 선생님께 문의해 주세요." : "비밀번호를 잊었다면 포토클리닉에 문의해 주세요."}</p>
      </form>
    </section>
  </main>;
}
function Header({ me, slug, desktopControls }: { me: MeData; slug: string; desktopControls?: ReactNode }) {
  const router = useRouter();
  return <header className={styles.topbar}>
    <div className={styles.brand}><i><ImageIcon size={16} /></i><span>{me.event.title}</span></div>
    {desktopControls ? <div className={styles.pcHeaderControls}>{desktopControls}</div> : null}
    <div className={styles.headerMeta}>
      <span className={styles.deadlineChip}>마감 {formatSeoulDeadline(me.event.deadline_at)}</span>
      <button className={styles.weak} aria-label="로그아웃" onClick={async () => { clearPersonSelectImageCache(slug); await fetch(`/api/pick/${slug}/logout`, { method: "POST" }); router.replace(`/pick/${slug}`); }}><LogOut size={17} /></button>
    </div>
  </header>;
}

export function PersonSelectHome({ slug }: { slug: string }) {
  const router = useRouter();
  const { me, loading, error } = useSelectionData(slug);
  const pendingSyncCount = usePendingPersonChoiceSyncCount(slug);
  const [submitError, setSubmitError] = useState("");
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pcActiveKey, setPcActiveKey] = useState("profile");
  if (loading) return <main className={styles.page}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  if (!me) return <main className={styles.page}><div className={styles.done}>{error || "다시 로그인해 주세요."}</div></main>;
  if (me.event.customer_stage === "delivery") return <PersonSelectDeliveryReview apiBase={`/api/pick/${slug}`} title={me.event.title} viewerName={me.person.display_name} />;
  const visibleCategories = me.categories
    .filter((category) => category.image_count > 0)
    .filter((category) => category.key !== "homeroom" || Boolean(me.person.group_label));
  const required = visibleCategories.filter((category) => category.need > 0);
  const completed = required.filter(isComplete).length;
  const missing = required.find((category) => !isComplete(category));
  const resolvedPcActiveKey = visibleCategories.some((category) => category.key === pcActiveKey) ? pcActiveKey : visibleCategories[0]?.key ?? "profile";

  const review = finalReviewData(visibleCategories);
  function openSubmitReview() {
    setSubmitError("");
    if (pendingSyncCount) { setSubmitError(`저장 안 된 변경 ${pendingSyncCount}건을 먼저 저장해 주세요.`); return; }
    setSubmitReviewOpen(true);
  }
  async function confirmSubmit() {
    if (submitting) return;
    setSubmitting(true); setSubmitError("");
    try { await jsonFetch(`/api/pick/${slug}/submit`, { method: "POST", body: JSON.stringify({ confirmed: true }) }); router.push(`/pick/${slug}/done`); }
    catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "제출하지 못했어요."); }
    finally { setSubmitting(false); }
  }

  return <main className={`${styles.page} ${styles.pcHomePage}`}>
    <Header me={me} slug={slug} desktopControls={<>
      <div className={styles.pillbar}>{visibleCategories.map((category) => <button key={category.key} className={`${styles.pill} ${resolvedPcActiveKey === category.key ? styles.pillActive : ""}`} onClick={() => setPcActiveKey(category.key)}>{isComplete(category) ? <Check size={14} aria-hidden="true" /> : null}{category.label}{category.key === "homeroom" && me.person.group_label ? ` · ${me.person.group_label}` : ""}{category.need > 1 ? ` ${category.choices.length}/${category.need}` : ""}</button>)}</div>
      <strong className={styles.pcHeaderProgress}>{completed} / {required.length} 선택</strong>
    </>} />
    <section className={`${styles.content} ${styles.mobileOnly}`}>
      <div className={styles.hello}><div><p className={styles.eyebrow}>사진 셀렉</p><h1>{me.person.display_name} {isSchoolEvent(me.event) ? "선생님" : "님"}</h1><p className={styles.muted}>각 항목에서 정해진 장수만큼 사진을 골라주세요.</p></div><div className={styles.progressText}>{completed} / {required.length} 선택</div></div>
      {me.event.locked ? <div className={styles.notice}>선택이 마감됐어요. 변경이 필요하면 포토클리닉에 연락해 주세요.</div> : null}
      <OfferNotice me={me} />
      <div className={styles.categoryList}>{visibleCategories.map((category) => {
        const first = category.choices[0];
        return <button key={category.key} className={styles.categoryRow} onClick={() => router.push(`/pick/${slug}/c/${category.key}`)}>
          {first?.thumb_url ? <img className={styles.choiceThumb} src={first.thumb_url} alt="고른 사진" draggable={false} onContextMenu={(e) => e.preventDefault()} /> : <span className={`${styles.choiceThumb} ${styles.emptyThumb}`}><ImageIcon size={21} /></span>}
          <div><h3>{category.label}{category.key === "homeroom" && me.person.group_label ? ` · ${me.person.group_label}` : ""}</h3><p>{category.choices.length === 0 ? `${category.image_count}장 중 ${category.need}장 선택` : category.need === 1 && category.choices.length === 1 ? shortFileName(first.original_file_name) : extraCount(category) ? `${category.choices.length}장 골랐어요 (기본 ${category.need} + 추가 ${extraCount(category)})` : `${category.choices.length} / ${category.need}장 골랐어요`}</p></div>
          <span className={`${styles.badge} ${isComplete(category) ? "" : styles.badgePending}`}>{category.choices.length ? `보정 요청 ${retouchCount(category)}개` : "미선택"}</span>
          <ChevronRight size={18} />
        </button>;
      })}
        {(me.event.offers ?? []).length || me.event.extra_price ? <button className={styles.categoryRow} onClick={() => router.push(`/pick/${slug}/order`)}>
          <span className={`${styles.choiceThumb} ${styles.emptyThumb}`}><ShoppingBag size={21} /></span>
          <div><h3>추가 주문</h3><p>{me.order?.lines.length ? me.order.lines.map((line) => line.label).join(" · ") : "추가 보정 · 액자 · 앨범 신청"}</p></div>
          <span className={`${styles.badge} ${me.order?.total ? styles.badgePending : ""}`}>{me.order?.total ? won(me.order.total) : "선택 사항"}</span>
          <ChevronRight size={18} />
        </button> : null}
      </div>
      <div className={styles.stepsCard}><h3>사진 셀렉은 이렇게 진행돼요</h3><div className={styles.stepList}><span><b>1</b>사진 확인</span><span><b>2</b>보정 요청</span><span><b>3</b>최종 제출</span></div></div>
    </section>
    <PcWorkspace slug={slug} me={me} activeKey={resolvedPcActiveKey} pendingSyncCount={pendingSyncCount} />
    <footer className={`${styles.submitDock} ${styles.mobileOnly}`}><div className={styles.submitDockInner}>{missing || submitError || pendingSyncCount ? <span className={styles.submitReason}>{submitError || (pendingSyncCount ? `저장 안 된 변경 ${pendingSyncCount}건 · 다시 시도` : missing ? needMessage(missing) : "")}</span> : null}<button className={styles.primary} disabled={Boolean(missing) || me.event.locked || pendingSyncCount > 0} onClick={openSubmitReview}>제출하기 ({completed}/{required.length})</button></div></footer>
    {submitReviewOpen ? <FinalSelectionSubmitDialog selectedCount={review.selectedCount} sections={review.sections} items={review.items} busy={submitting} error={submitError} onCancel={() => { if (!submitting) setSubmitReviewOpen(false); }} onConfirm={() => void confirmSubmit()} /> : null}
  </main>;
}

export function PersonSelectCategory({ slug, categoryKey }: { slug: string; categoryKey: string }) {
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
  const { images, loading, ensurePreviews } = usePersonSelectImages(slug, categoryKey, seedImages);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [message, setMessage] = useState("");
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
    {images.length === 0 ? <div className={styles.done}>아직 올라온 사진이 없어요. 포토클리닉에 문의해 주세요.</div> : <div className={styles.photoGrid}>{shown.map((image) => <PersonSelectPhotoTile key={image.id} image={image} selected={displayedIds.has(image.id)} pending={sync.pendingImageIds.has(image.id)} onOpen={openPreview} />)}</div>}
    <div className={styles.darkDock}><p>{message || selectionSyncStatus(sync)}{message ? "" : ` · ${dockText}`}</p><button className={styles.mintButton} disabled={count === 0 || me.event.locked || sync.pendingCount > 0} onClick={() => { void sync.flushNow().then((saved) => { if (saved) router.push(`/pick/${slug}/c/${categoryKey}/feedback`); }); }}>고른 사진 보정 요청 쓰기</button></div>
    {preview ? <div className={styles.lightbox}>
      <div className={styles.lightboxTop}><button className={styles.iconButton} onClick={() => setPreviewIndex(null)} aria-label="뒤로"><ArrowLeft /></button><strong>{(previewIndex ?? 0) + 1} / {images.length}</strong><button className={styles.iconButton} onClick={() => setPreviewIndex(null)} aria-label="닫기"><X size={20} strokeWidth={2} /></button></div>
      <div className={styles.preview}><img src={preview.preview_url || preview.thumb_url} alt={preview.original_file_name} draggable={false} onContextMenu={(e) => e.preventDefault()} /><div className={styles.previewNav}><button className={styles.iconButton} disabled={!previewIndex} onClick={() => setPreviewIndex(Math.max(0, (previewIndex ?? 0) - 1))}><ChevronLeft /></button><button className={styles.iconButton} disabled={previewIndex === images.length - 1} onClick={() => setPreviewIndex(Math.min(images.length - 1, (previewIndex ?? 0) + 1))}><ChevronRight /></button></div></div>
      <div className={styles.lightboxActions}>{displayedIds.has(preview.id) ? <button className={styles.secondary} onClick={() => clearChoice(preview.id)}>선택 해제</button> : <button className={styles.secondary} onClick={() => choose(preview.id)}>이 사진 고르기 ({count}/{category.need})</button>}<button className={styles.mintButton} disabled={count === 0 || sync.pendingCount > 0} onClick={() => { void sync.flushNow().then((saved) => { if (saved) router.push(`/pick/${slug}/c/${categoryKey}/feedback`); }); }}>보정 요청 쓰기</button></div>
    </div> : null}
  </main>;
}

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
    } catch { setToast("저장하지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <header className={styles.topbar}><button className={styles.weak} onClick={() => router.back()}><ArrowLeft /></button><strong>보정 요청</strong><span style={{ width: 44 }} /></header>
    <section className={styles.feedbackContent}><p className={styles.eyebrow}>{category.label} · {category.choices.length}장</p><h1>보정 요청을 남겨주세요.</h1><p className={styles.muted}>사진마다 원하는 항목을 여러 개 고를 수 있어요.</p>
      {category.choices.map((choice, index) => {
        const draft = drafts[choice.id] ?? { keys: choice.retouch_keys, memo: choice.memo };
        return <div key={choice.id}>
          <div className={styles.selectedCard}><img src={choice.thumb_url || ""} alt="고른 사진" draggable={false} onContextMenu={(e) => e.preventDefault()} /><div><strong>{shortFileName(choice.original_file_name)}</strong><p className={styles.muted}>고른 사진 {category.choices.length > 1 ? `${index + 1}` : ""}</p></div>{index === 0 ? <button className={styles.secondary} onClick={() => router.push(`/pick/${slug}/c/${categoryKey}`)}>다른 사진 고르기</button> : null}</div>
          <div className={styles.field}><label>보정 체크리스트</label><div className={styles.chipGrid}>{me.event.retouch_options.map((option) => { const active = draft.keys.includes(option.key); return <button type="button" key={option.key} aria-pressed={active} className={`${styles.chip} ${active ? styles.chipActive : ""}`} onClick={() => update(choice.id, { keys: active ? draft.keys.filter((key) => key !== option.key) : [...draft.keys, option.key] })}>{active ? <Check size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> : null}{option.label}</button>; })}</div></div>
          <div className={styles.field}><label htmlFor={`pick-memo-${choice.id}`}>메모</label><textarea id={`pick-memo-${choice.id}`} className={styles.textarea} maxLength={me.event.memo_max} value={draft.memo} onChange={(e) => update(choice.id, { memo: e.target.value })} placeholder="추가로 원하는 내용을 적어주세요." /><span className={styles.counter}>{draft.memo.length} / {me.event.memo_max}</span></div>
        </div>;
      })}
      <p className={styles.feedbackInfo}>아무것도 고르지 않으면 기본 보정(자연스럽게)으로 진행해요.</p>
    </section>
    <footer className={styles.feedbackDock}><div><button className={styles.primary} disabled={me.event.locked || busy} onClick={save}>저장하고 돌아가기</button><small>{selectionSyncStatus(sync)} · 최종 제출은 홈에서 해주세요.</small></div></footer>
    {toast ? <div className={styles.toast}>{toast}</div> : null}
  </main>;
}

export function PersonSelectDone({ slug }: { slug: string }) {
  const router = useRouter();
  const { me, loading } = useSelectionData(slug);
  if (loading || !me) return <main className={styles.page}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  return <main className={styles.page}><Header me={me} slug={slug} /><section className={styles.done}><div className={styles.doneIcon}><CheckCircle2 /></div><h1>사진 셀렉을 제출했어요.</h1><p className={styles.muted}>마감 전까지 언제든 선택과 보정 요청을 바꿀 수 있어요.</p><div className={styles.summaryList}>{me.categories.flatMap((category) => category.choices.map((choice) => <div className={styles.summaryRow} key={choice.id}><img src={choice.thumb_url || ""} alt="고른 사진" draggable={false} onContextMenu={(e) => e.preventDefault()} /><div><strong>{category.label}</strong><p>{choice.original_file_name}</p><small className={styles.muted}>보정 요청 {choice.retouch_keys.length}개 · 메모 {choice.memo ? "있음" : "없음"}</small></div></div>))}</div>{me.order?.lines.length ? <OrderSummary lines={me.order.lines} total={me.order.total} /> : null}<button className={styles.secondary} onClick={() => router.push(`/pick/${slug}/home`)}>선택 바꾸기</button></section></main>;
}

/** 추가 주문 내역과 합계 */
function OrderSummary({ lines, total }: { lines: OrderLine[]; total: number }) {
  return <div className={styles.orderSummary}>
    <h3>추가 주문</h3>
    {lines.map((line, index) => <div key={index} className={styles.orderSummaryRow}><div><strong>{line.label}</strong>{line.detail ? <small>{line.detail}</small> : null}</div><span>{line.qty} × {won(line.unitPrice)}</span><b>{won(line.amount)}</b></div>)}
    <div className={styles.orderSummaryTotal}><span>합계</span><b>{won(total)}</b></div>
    <p className={styles.muted}>결제 방법은 포토클리닉에서 따로 안내드려요.</p>
  </div>;
}

/** 추가 주문 화면: 안내 문구, 추가 보정(자동 계산), 액자·앨범 같은 상품 신청 */
export function PersonSelectOrder({ slug }: { slug: string }) {
  const router = useRouter();
  const { me, loading, error } = useSelectionData(slug);
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (me && items === null) setItems(me.order?.items ?? []); }, [me, items]);
  if (loading || !me || items === null) return <main className={styles.page}><div className={styles.done}>{error || "불러오는 중이에요"}</div></main>;
  const currentItems = items;
  const offers = me.event.offers ?? [];
  const photos = me.categories.flatMap((category) => category.choices);
  const extra = me.categories.reduce((sum, category) => sum + extraCount(category), 0);
  const extraPrice = me.event.extra_price ?? 0;
  const priceOf = (item: OrderItem) => { const offer = offers.find((entry) => entry.key === item.offer_key); const option = offer?.options.find((entry) => entry.key === item.option_key); return option ? option.price : offer?.price ?? 0; };
  const total = extra * extraPrice + currentItems.reduce((sum, item) => sum + priceOf(item) * item.qty, 0);
  const update = (index: number, patch: Partial<OrderItem>) => setItems(currentItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const add = (offer: Offer) => setItems([...currentItems, { offer_key: offer.key, option_key: offer.options[0]?.key ?? null, image_id: offer.needs_photo ? photos[0]?.image_id ?? null : null, qty: 1 }]);
  async function save() {
    setBusy(true); setMessage("");
    try { await jsonFetch(`/api/pick/${slug}/orders`, { method: "PUT", body: JSON.stringify({ items: currentItems }) }); router.push(`/pick/${slug}/home`); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <header className={styles.topbar}><button className={styles.weak} onClick={() => router.push(`/pick/${slug}/home`)} aria-label="뒤로"><ArrowLeft /></button><strong>추가 주문</strong><span style={{ width: 44 }} /></header>
    <section className={styles.feedbackContent} style={{ paddingBottom: 200 }}>
      <p className={styles.eyebrow}>선택 사항</p><h1>필요한 것만 신청해 주세요.</h1>
      <OfferNotice me={me} />
      {extraPrice ? <div className={styles.orderCard}>
        <div className={styles.orderCardHead}><div><h3>추가 보정</h3><p className={styles.muted}>기본 장수보다 더 고른 사진만큼 자동으로 계산돼요.</p></div><b>{won(extraPrice)}/장</b></div>
        <div className={styles.orderLine}><span>지금 추가로 고른 사진 {extra}장</span><b>{won(extra * extraPrice)}</b></div>
        <button className={styles.secondary} onClick={() => router.push(`/pick/${slug}/home`)}>사진 더 고르기</button>
      </div> : null}
      {offers.length ? <div className={styles.offerGrid}>
        {offers.map((offer) => {
          const blocked = offer.needs_photo && !photos.length;
          const activeOptionKeys = currentItems.filter((item) => item.offer_key === offer.key).map((item) => item.option_key);
          return <div key={offer.key} className={`${styles.orderCard} ${styles.offerTile}`}>
            <div><h3>{offer.label}</h3><b className={styles.offerTilePrice}>{offer.options.length ? `${won(Math.min(...offer.options.map((option) => option.price)))}부터` : `${won(offer.price)}/${offer.unit || "개"}`}</b></div>
            <OfferImages offer={offer} activeOptionKeys={activeOptionKeys} />
            {offer.options.length ? <p className={styles.offerTileNote}>{offer.options.map((option) => `${option.label.split(" (")[0]} ${won(option.price)}`).join("\n")}</p> : null}
            {offer.note ? <p className={styles.offerTileNote}>{offer.note}</p> : null}
            <button className={`${styles.secondary} ${styles.orderAdd}`} disabled={blocked || me.event.locked} onClick={() => add(offer)}><Plus size={15} />추가</button>
            {blocked ? <p className={styles.muted}>사진을 먼저 골라 주세요.</p> : null}
          </div>;
        })}
      </div> : null}
      {currentItems.length ? <div className={styles.orderCard}>
        <div className={styles.orderCardHead}><div><h3>신청 내역</h3></div></div>
        {currentItems.map((item, index) => {
          const offer = offers.find((entry) => entry.key === item.offer_key);
          if (!offer) return null;
          return <div key={index} className={styles.orderLine}>
            <span className={styles.orderLineTitle}>{offer.label}</span>
            {offer.options.length ? <select className={styles.orderSelect} value={item.option_key ?? ""} onChange={(e) => update(index, { option_key: e.target.value })}>{offer.options.map((option) => <option key={option.key} value={option.key}>{option.label} · {won(option.price)}</option>)}</select> : null}
            {offer.needs_photo ? <select className={styles.orderSelect} value={item.image_id ?? ""} onChange={(e) => update(index, { image_id: e.target.value })}>{photos.map((photo) => <option key={photo.image_id} value={photo.image_id}>{shortFileName(photo.original_file_name)}</option>)}</select> : null}
            <span className={styles.qty}><button aria-label="수량 줄이기" disabled={item.qty <= 1} onClick={() => update(index, { qty: item.qty - 1 })}><Minus size={14} /></button><b>{item.qty}</b><button aria-label="수량 늘리기" disabled={item.qty >= 20} onClick={() => update(index, { qty: item.qty + 1 })}><Plus size={14} /></button></span>
            <b>{won(priceOf(item) * item.qty)}</b>
            <button className={styles.weak} aria-label="빼기" onClick={() => setItems(currentItems.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
          </div>;
        })}
      </div> : null}
      {message ? <div className={styles.error}>{message}</div> : null}
    </section>
    <footer className={styles.feedbackDock}><div><div className={styles.orderSummaryTotal}><span>합계</span><b>{won(total)}</b></div><button className={styles.primary} disabled={me.event.locked || busy} onClick={save}>저장하고 돌아가기</button><small>결제 방법은 포토클리닉에서 따로 안내드려요.<br />최종 제출은 홈에서 해주세요.</small></div></footer>
  </main>;
}

/** 상품 예시 사진. 누르면 크게 본다. 고객이 고른 크기의 사진은 테두리로 표시한다. */
function OfferImages({ offer, activeOptionKeys }: { offer: Offer; activeOptionKeys: (string | null)[] }) {
  const images = offerImagesFor(offer);
  const [open, setOpen] = useState<string | null>(null);
  if (!images.length) return null;
  const opened = images.find((image) => image.src === open);
  return <>
    <div className={images.length > 1 ? styles.offerImagesTwo : styles.offerImages}>
      {images.map((image) => {
        const active = Boolean(image.option_keys?.some((key) => activeOptionKeys.includes(key)));
        return <button key={image.src} type="button" className={`${styles.offerImage} ${active ? styles.offerImageActive : ""}`} onClick={() => setOpen(image.src)} aria-label={`${image.caption} 크게 보기`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={image.caption} loading="lazy" />
          <span>{image.caption}</span>
        </button>;
      })}
    </div>
    {opened ? <div className={styles.offerImageViewer} role="dialog" aria-label={opened.caption} onClick={() => setOpen(null)}>
      <button type="button" className={styles.offerImageClose} aria-label="닫기" onClick={() => setOpen(null)}><X size={20} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={opened.src} alt={opened.caption} />
      <span>{opened.caption}</span>
    </div> : null}
  </>;
}
