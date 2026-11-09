"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, ImageIcon, LogOut, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { formatSeoulDeadline } from "@/lib/person-select/date";
import { resolveClassicSelectionShortcut } from "@/lib/person-select/classicSelection";
import { offerImagesFor } from "@/lib/person-select/types";
import styles from "./PersonSelectPublic.module.css";

type Category = { key: string; label: string; pick: number; image_count: number; need: number; max: number; choices: Choice[] };
type Choice = { id: string; image_id: string; original_file_name: string; thumb_url: string | null; retouch_keys: string[]; memo: string; updated_at: string };
type EventData = { title: string; slug: string; deadline_at: string; status: string; source_layout?: "school" | "person-folders" | null; retouch_options: { key: string; label: string }[]; memo_max: number; locked: boolean; offer_notice?: string; extra_price?: number; extra_max?: number; offers?: Offer[] };
type Offer = { key: string; label: string; unit: string; price: number; note: string; needs_photo: boolean; options: { key: string; label: string; price: number }[] };
type OrderItem = { offer_key: string; option_key: string | null; image_id: string | null; qty: number };
type OrderLine = { label: string; detail: string; unitPrice: number; qty: number; amount: number };
type MeData = { event: EventData; person: { display_name: string; group_label: string | null; submitted_at: string | null }; categories: Category[]; order?: { items: OrderItem[]; lines: OrderLine[]; total: number } };
type ImageData = { id: string; original_file_name: string; thumb_url: string; preview_url: string; width: number | null; height: number | null };
type PublicEvent = Pick<EventData, "title" | "slug" | "deadline_at" | "status" | "source_layout">;

/** 학교(선생님) 행사인지. 예전 행사는 값이 없으면 학교로 본다. */
function isSchoolEvent(event: { source_layout?: string | null } | null | undefined) {
  return !event?.source_layout || event.source_layout === "school";
}
type ImageCacheEntry = { images: ImageData[]; fetchedAt: number };

const IMAGE_CACHE_MAX_AGE_MS = 9 * 60_000;
const FIRST_PHOTO_TIMER_KEY = "person-select-login-started-at";
const imageCache = new Map<string, ImageCacheEntry>();
const imageRequests = new Map<string, Promise<ImageData[]>>();

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했어요.");
  return data as T;
}

function imageCacheKey(slug: string, category: string) {
  return `${slug}:${category}`;
}

function clearImageCache(slug: string) {
  for (const key of imageCache.keys()) if (key.startsWith(`${slug}:`)) imageCache.delete(key);
  for (const key of imageRequests.keys()) if (key.startsWith(`${slug}:`)) imageRequests.delete(key);
}

function cachedImages(slug: string, category: string) {
  const cached = imageCache.get(imageCacheKey(slug, category));
  return cached && Date.now() - cached.fetchedAt < IMAGE_CACHE_MAX_AGE_MS ? cached.images : null;
}

function fetchImages(slug: string, category: string) {
  const key = imageCacheKey(slug, category);
  const cached = cachedImages(slug, category);
  if (cached) return Promise.resolve(cached);
  const pending = imageRequests.get(key);
  if (pending) return pending;
  const request = jsonFetch<{ images: ImageData[] }>(`/api/pick/${slug}/images?category=${encodeURIComponent(category)}`)
    .then((data) => {
      imageCache.set(key, { images: data.images, fetchedAt: Date.now() });
      return data.images;
    })
    .finally(() => imageRequests.delete(key));
  imageRequests.set(key, request);
  return request;
}

function isComplete(category: Category) {
  return category.choices.length >= category.need && category.choices.length <= Math.max(category.need, category.max ?? category.need);
}

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

/** 기본 장수를 넘겨 고른 장수 (추가 보정) */
function extraCount(category: Category) {
  return Math.max(0, category.choices.length - Math.max(1, category.pick));
}

/** 관리자가 적은 안내 문구와 추가 보정 가격을 보여준다. */
function OfferNotice({ me }: { me: MeData }) {
  const notice = me.event.offer_notice?.trim();
  const extraPrice = me.event.extra_price ?? 0;
  if (!notice && !extraPrice && !(me.event.offers ?? []).length) return null;
  return <div className={styles.offerNotice}>
    {notice ? <p>{notice}</p> : null}
    {extraPrice ? <p className={styles.offerNoticePrice}>추가 보정 {won(extraPrice)}/장 · 기본 장수보다 더 고르면 자동으로 추가돼요{me.event.extra_max ? ` (최대 ${me.event.extra_max}장)` : ""}.</p> : null}
  </div>;
}

function retouchCount(category: Category) {
  return category.choices.reduce((sum, choice) => sum + choice.retouch_keys.length, 0);
}

function needMessage(category: Category) {
  if (category.choices.length > Math.max(category.need, category.max ?? category.need)) return `${category.label}은 ${category.max}장까지 고를 수 있어요.`;
  return `${category.label}을 ${category.need}장 골라주세요.`;
}

function shortFileName(value: string) {
  return value.length > 34 ? `…${value.slice(-32)}` : value;
}

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
      clearImageCache(slug);
      window.sessionStorage.setItem(FIRST_PHOTO_TIMER_KEY, String(Date.now()));
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

function useSelectionData(slug: string) {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const result = await jsonFetch<{ ok: true } & MeData>(`/api/pick/${slug}/me`);
      setMe(result); setError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "사진을 불러오지 못했어요.";
      if (message.includes("로그인")) router.replace(`/pick/${slug}?reason=session`);
      else setError(message);
    } finally { if (!options?.silent) setLoading(false); }
  }, [router, slug]);
  useEffect(() => { void load(); }, [load]);
  return { me, loading, error, load };
}

function Header({ me, slug, desktopControls }: { me: MeData; slug: string; desktopControls?: ReactNode }) {
  const router = useRouter();
  return <header className={styles.topbar}>
    <div className={styles.brand}><i><ImageIcon size={16} /></i><span>{me.event.title}</span></div>
    {desktopControls ? <div className={styles.pcHeaderControls}>{desktopControls}</div> : null}
    <div className={styles.headerMeta}>
      <span className={styles.deadlineChip}>마감 {formatSeoulDeadline(me.event.deadline_at)}</span>
      <button className={styles.weak} aria-label="로그아웃" onClick={async () => { clearImageCache(slug); await fetch(`/api/pick/${slug}/logout`, { method: "POST" }); router.replace(`/pick/${slug}`); }}><LogOut size={17} /></button>
    </div>
  </header>;
}

export function PersonSelectHome({ slug }: { slug: string }) {
  const router = useRouter();
  const { me, loading, error, load } = useSelectionData(slug);
  const [submitError, setSubmitError] = useState("");
  const [pcActiveKey, setPcActiveKey] = useState("profile");
  if (loading) return <main className={styles.page}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  if (!me) return <main className={styles.page}><div className={styles.done}>{error || "다시 로그인해 주세요."}</div></main>;
  const visibleCategories = me.categories
    .filter((category) => category.image_count > 0)
    .filter((category) => category.key !== "homeroom" || Boolean(me.person.group_label));
  const required = visibleCategories.filter((category) => category.need > 0);
  const completed = required.filter(isComplete).length;
  const missing = required.find((category) => !isComplete(category));
  const resolvedPcActiveKey = visibleCategories.some((category) => category.key === pcActiveKey) ? pcActiveKey : visibleCategories[0]?.key ?? "profile";

  async function submit() {
    setSubmitError("");
    try { await jsonFetch(`/api/pick/${slug}/submit`, { method: "POST" }); router.push(`/pick/${slug}/done`); }
    catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "제출하지 못했어요."); }
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
    <PcWorkspace slug={slug} me={me} activeKey={resolvedPcActiveKey} reload={() => load({ silent: true })} />
    <footer className={`${styles.submitDock} ${styles.mobileOnly}`}><div className={styles.submitDockInner}>{missing || submitError ? <span className={styles.submitReason}>{submitError || (missing ? needMessage(missing) : "")}</span> : null}<button className={styles.primary} disabled={Boolean(missing) || me.event.locked} onClick={submit}>최종 제출 ({completed}/{required.length})</button></div></footer>
  </main>;
}

function useImages(slug: string, category: string) {
  const [images, setImages] = useState<ImageData[]>(() => cachedImages(slug, category) ?? []);
  const [loading, setLoading] = useState(() => !cachedImages(slug, category));
  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const key = imageCacheKey(slug, category);
    const scheduleRefresh = (delay = IMAGE_CACHE_MAX_AGE_MS) => {
      refreshTimer = setTimeout(() => {
        imageCache.delete(key);
        fetchImages(slug, category).then((nextImages) => {
          if (!active) return;
          setImages(nextImages);
          scheduleRefresh();
        }).catch(() => undefined);
      }, delay);
    };
    const entry = imageCache.get(key);
    const cached = cachedImages(slug, category);
    if (cached && entry) {
      setImages(cached);
      setLoading(false);
      scheduleRefresh(Math.max(1, IMAGE_CACHE_MAX_AGE_MS - (Date.now() - entry.fetchedAt)));
      return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); };
    }
    setLoading(true);
    fetchImages(slug, category)
      .then((nextImages) => { if (active) { setImages(nextImages); scheduleRefresh(); } })
      .catch(() => { if (active) setImages([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); };
  }, [category, slug]);
  return { images, loading };
}

export function PersonSelectCategory({ slug, categoryKey }: { slug: string; categoryKey: string }) {
  const router = useRouter();
  const { me, loading: meLoading, error, load } = useSelectionData(slug);
  const { images, loading } = useImages(slug, categoryKey);
  const category = me?.categories.find((item) => item.key === categoryKey);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [message, setMessage] = useState("");
  if (meLoading || loading) return <main className={styles.darkPage}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  if (!me || !category) return <main className={styles.darkPage}><div className={styles.done}>{error || "항목을 찾을 수 없어요."}</div></main>;
  const currentMe = me;
  const selectedIds = new Set(category.choices.map((choice) => choice.image_id));

  async function choose(imageId: string) {
    if (currentMe.event.locked) return;
    setMessage("");
    try {
      await jsonFetch(`/api/pick/${slug}/choices/${categoryKey}`, { method: "PUT", body: JSON.stringify({ image_id: imageId, retouch_keys: [], memo: "" }) });
      await load({ silent: true });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "고르지 못했어요."); }
  }
  async function clearChoice(imageId: string) {
    if (currentMe.event.locked) return;
    setMessage("");
    try {
      await jsonFetch(`/api/pick/${slug}/choices/${categoryKey}?image_id=${encodeURIComponent(imageId)}`, { method: "DELETE" });
      await load({ silent: true });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "선택을 빼지 못했어요."); }
  }
  const shown = filter === "selected" ? images.filter((image) => selectedIds.has(image.id)) : images;
  const preview = previewIndex === null ? null : images[previewIndex];
  const count = category.choices.length;
  const extra = extraCount(category);
  const dockText = message || (count === 0 ? `사진을 ${category.need}장 골라주세요${category.max > category.need ? ` · ${category.max}장까지 더 고를 수 있어요` : ""}` : extra && me.event.extra_price ? `${count}장 골랐어요 · 추가 보정 ${extra}장 ${won(extra * me.event.extra_price)}` : isComplete(category) ? "고른 사진의 보정 요청을 적어주세요." : `${count} / ${category.need}장 골랐어요`);
  return <main className={styles.darkPage}>
    <header className={styles.darkTop}><button onClick={() => router.push(`/pick/${slug}/home`)} aria-label="뒤로"><ArrowLeft /></button><strong>{category.label}</strong><span>{images.length}장</span></header>
    <div className={styles.subtabs}><button className={`${styles.subtab} ${filter === "all" ? styles.subtabActive : ""}`} onClick={() => setFilter("all")}>전체 {images.length}</button><button className={`${styles.subtab} ${filter === "selected" ? styles.subtabActive : ""}`} onClick={() => setFilter("selected")}>고른 사진 {count} / {category.need}{category.max > category.need ? `+` : ""}</button></div>
    {images.length === 0 ? <div className={styles.done}>아직 올라온 사진이 없어요. 포토클리닉에 문의해 주세요.</div> : <div className={styles.photoGrid}>{shown.map((image) => <button key={image.id} className={`${styles.photoTile} ${selectedIds.has(image.id) ? styles.photoTileSelected : ""}`} onClick={() => setPreviewIndex(images.findIndex((item) => item.id === image.id))}><img src={image.thumb_url} alt={image.original_file_name} loading="lazy" decoding="async" draggable={false} onContextMenu={(e) => e.preventDefault()} />{selectedIds.has(image.id) ? <span className={styles.check}><Check size={17} /></span> : null}</button>)}</div>}
    <div className={styles.darkDock}><p>{dockText}</p><button className={styles.mintButton} disabled={count === 0 || me.event.locked} onClick={() => router.push(`/pick/${slug}/c/${categoryKey}/feedback`)}>고른 사진 보정 요청 쓰기</button></div>
    {preview ? <div className={styles.lightbox}>
      <div className={styles.lightboxTop}><button className={styles.iconButton} onClick={() => setPreviewIndex(null)} aria-label="뒤로"><ArrowLeft /></button><strong>{(previewIndex ?? 0) + 1} / {images.length}</strong><button className={styles.iconButton} onClick={() => setPreviewIndex(null)} aria-label="닫기"><X size={20} strokeWidth={2} /></button></div>
      <div className={styles.preview}><img src={preview.preview_url} alt={preview.original_file_name} draggable={false} onContextMenu={(e) => e.preventDefault()} /><div className={styles.previewNav}><button className={styles.iconButton} disabled={!previewIndex} onClick={() => setPreviewIndex(Math.max(0, (previewIndex ?? 0) - 1))}><ChevronLeft /></button><button className={styles.iconButton} disabled={previewIndex === images.length - 1} onClick={() => setPreviewIndex(Math.min(images.length - 1, (previewIndex ?? 0) + 1))}><ChevronRight /></button></div></div>
      <div className={styles.lightboxActions}>{selectedIds.has(preview.id) ? <button className={styles.secondary} onClick={() => void clearChoice(preview.id)}>선택 해제</button> : <button className={styles.secondary} onClick={() => void choose(preview.id)}>이 사진 고르기 ({count}/{category.need})</button>}<button className={styles.mintButton} disabled={count === 0} onClick={() => router.push(`/pick/${slug}/c/${categoryKey}/feedback`)}>보정 요청 쓰기</button></div>
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
      // 사진마다 보정 요청과 메모를 따로 저장한다.
      for (const choice of currentCategory.choices) {
        const draft = drafts[choice.id] ?? { keys: choice.retouch_keys, memo: choice.memo };
        await jsonFetch(`/api/pick/${slug}/choices/${categoryKey}`, { method: "PUT", body: JSON.stringify({ image_id: choice.image_id, retouch_keys: draft.keys, memo: draft.memo }) });
      }
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
    <footer className={styles.feedbackDock}><div><button className={styles.primary} disabled={me.event.locked || busy} onClick={save}>저장하고 돌아가기</button><small>저장만 돼요. 최종 제출은 홈에서 해주세요.</small></div></footer>
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

function PcWorkspace({ slug, me, activeKey, reload }: { slug: string; me: MeData; activeKey: string; reload: () => Promise<void> }) {
  const categories = me.categories
    .filter((item) => item.image_count > 0)
    .filter((item) => item.key !== "homeroom" || Boolean(me.person.group_label));
  const active = categories.find((item) => item.key === activeKey) ?? categories[0];
  const { images } = useImages(slug, active?.key ?? "profile");
  const [previewId, setPreviewId] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [chosen, setChosen] = useState<Choice[]>(active?.choices ?? []);
  const [submitError, setSubmitError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequence = useRef(0);
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const firstPhotoMeasured = useRef(false);
  const serverChoices = active?.choices;
  const need = active?.need ?? 0;
  const limit = Math.max(1, active?.max || active?.pick || 1);
  useEffect(() => { setChosen(serverChoices ?? []); }, [serverChoices]);
  // 항목이나 사진 목록이 바뀔 때만 미리보기를 처음으로 돌린다. (사진을 고를 때마다 튀지 않게)
  useEffect(() => {
    setPreviewId((current) => images.some((image) => image.id === current) ? current : (serverChoices?.[0]?.image_id || images[0]?.id || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, images]);
  const preview = images.find((image) => image.id === previewId) ?? images[0];
  const previewIndex = preview ? images.findIndex((image) => image.id === preview.id) : -1;
  const previewChoice = preview ? chosen.find((item) => item.image_id === preview.id) ?? null : null;
  useEffect(() => {
    setKeys(previewChoice?.retouch_keys ?? []);
    setMemo(previewChoice?.memo ?? "");
    setSavedAt(previewChoice ? "자동 저장됨" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewChoice?.id, preview?.id]);
  const save = useCallback(async (imageId: string, nextKeys: string[], nextMemo: string, refreshSummary = false) => {
    if (!active) return;
    const selectedImage = images.find((image) => image.id === imageId);
    if (!selectedImage) return;
    const previous = chosen;
    const requestId = ++saveSequence.current;
    const existing = previous.find((item) => item.image_id === imageId);
    const optimisticChoice: Choice = {
      id: existing?.id ?? `pending-${imageId}`,
      image_id: imageId,
      original_file_name: selectedImage.original_file_name,
      thumb_url: selectedImage.thumb_url,
      retouch_keys: nextKeys,
      memo: nextMemo,
      updated_at: new Date().toISOString(),
    };
    setChosen(existing ? previous.map((item) => item.image_id === imageId ? optimisticChoice : item) : limit === 1 ? [optimisticChoice] : [...previous, optimisticChoice]);
    if (imageId === preview?.id) { setKeys(nextKeys); setMemo(nextMemo); }
    setSavedAt("저장 중");
    try {
      await jsonFetch(`/api/pick/${slug}/choices/${active.key}`, { method: "PUT", body: JSON.stringify({ image_id: imageId, retouch_keys: nextKeys, memo: nextMemo }) });
      if (requestId === saveSequence.current) setSavedAt("자동 저장됨 · 방금");
      if (refreshSummary) await reload();
    } catch (cause) {
      if (requestId === saveSequence.current) {
        setChosen(previous);
        setSavedAt(cause instanceof Error ? cause.message : "저장하지 못했어요. 다시 시도해 주세요.");
      }
    }
  }, [active, chosen, images, limit, preview?.id, reload, slug]);
  const clearChoice = useCallback(async (imageId: string) => {
    if (!active) return;
    const previous = chosen;
    if (timer.current) clearTimeout(timer.current);
    ++saveSequence.current;
    setChosen(previous.filter((item) => item.image_id !== imageId));
    setSavedAt("저장 중");
    try {
      await jsonFetch(`/api/pick/${slug}/choices/${active.key}?image_id=${encodeURIComponent(imageId)}`, { method: "DELETE" });
      setSavedAt("");
      await reload();
    } catch {
      setChosen(previous);
      setSavedAt("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }, [active, chosen, reload, slug]);
  function schedule(nextKeys: string[], nextMemo: string) { if (!previewChoice?.image_id) return; const imageId = previewChoice.image_id; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void save(imageId, nextKeys, nextMemo), 800); }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (previewIndex < 0) return;
    for (const offset of [-2, -1, 1, 2]) {
      const source = images[previewIndex + offset]?.preview_url;
      if (source) new Image().src = source;
    }
  }, [images, previewIndex]);
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
  const chosenIds = useMemo(() => new Set(chosen.map((item) => item.image_id)), [chosen]);
  const full = limit > 1 && chosen.length >= limit;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!preview || event.repeat
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)) return;
      const index = images.findIndex((image) => image.id === preview.id);
      if (event.key === "ArrowLeft") { event.preventDefault(); setPreviewId(images[Math.max(0, index - 1)]?.id ?? preview.id); }
      if (event.key === "ArrowRight") { event.preventDefault(); setPreviewId(images[Math.min(images.length - 1, index + 1)]?.id ?? preview.id); }
      if (event.key === " ") { event.preventDefault(); if (!chosenIds.has(preview.id) && !full) void save(preview.id, [], "", true); }
      const shortcut = resolveClassicSelectionShortcut(event.key);
      if (shortcut === "select") {
        event.preventDefault();
        if (!chosenIds.has(preview.id) && !full && !me.event.locked) void save(preview.id, [], "", true);
      }
      if (shortcut === "clear") {
        event.preventDefault();
        if (chosenIds.has(preview.id) && !me.event.locked) void clearChoice(preview.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chosenIds, clearChoice, full, images, me.event.locked, preview, save]);
  if (!active) return null;
  const required = categories.filter((item) => item.need > 0);
  const missing = required.find((item) => item.key === active.key ? (chosen.length < item.need || chosen.length > Math.max(item.need, item.max)) : !isComplete(item));
  async function submit() {
    setSubmitError("");
    try { await jsonFetch(`/api/pick/${slug}/submit`, { method: "POST" }); window.location.href = `/pick/${slug}/done`; }
    catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "제출하지 못했어요."); }
  }
  function scrollFilmstrip(direction: -1 | 1) {
    const filmstrip = filmstripRef.current;
    if (!filmstrip) return;
    filmstrip.scrollBy({ left: direction * filmstrip.clientWidth, behavior: "smooth" });
  }
  function measureFirstPhoto() {
    if (firstPhotoMeasured.current) return;
    firstPhotoMeasured.current = true;
    const startedAt = Number(window.sessionStorage.getItem(FIRST_PHOTO_TIMER_KEY));
    if (!Number.isFinite(startedAt) || startedAt <= 0) return;
    const milliseconds = Date.now() - startedAt;
    window.sessionStorage.removeItem(FIRST_PHOTO_TIMER_KEY);
    console.info(`[person-select] 로그인 후 첫 사진 표시: ${milliseconds}ms`);
  }
  const missingText = missing ? (missing.key === active.key ? needMessage({ ...missing, choices: chosen }) : needMessage(missing)) : "";
  return <section className={styles.pcWorkspace}>
    <div className={styles.pcBody}>
      <div className={styles.pcPhotos}>
        <div className={styles.pcPreview}>
          <div className={styles.preview}>
            {preview ? <img src={preview.preview_url} alt={preview.original_file_name} onLoad={measureFirstPhoto} draggable={false} onContextMenu={(e) => e.preventDefault()} /> : <span className={styles.pcPhotoEmpty}>아직 올라온 사진이 없어요. 포토클리닉에 문의해 주세요.</span>}
            <div className={styles.pcPreviewInfo}><strong title={preview?.original_file_name}>{preview ? shortFileName(preview.original_file_name) : "사진 없음"}</strong><span>{preview ? `${previewIndex + 1} / ${images.length}` : `0 / ${images.length}`}</span></div>
            <button className={`${styles.pcNavButton} ${styles.pcNavPrevious}`} disabled={previewIndex <= 0} onClick={() => setPreviewId(images[previewIndex - 1]?.id ?? preview?.id ?? "")} aria-label="이전 사진"><ChevronLeft size={20} /></button>
            <button className={`${styles.pcNavButton} ${styles.pcNavNext}`} disabled={previewIndex < 0 || previewIndex >= images.length - 1} onClick={() => setPreviewId(images[previewIndex + 1]?.id ?? preview?.id ?? "")} aria-label="다음 사진"><ChevronRight size={20} /></button>
            {previewChoice
              ? <button className={`${styles.pcSelectButton} ${styles.pcSelectButtonSelected}`} disabled={me.event.locked} onClick={() => void clearChoice(previewChoice.image_id)} title="선택 해제"><Check size={16} aria-hidden="true" />선택됨</button>
              : <button className={styles.pcSelectButton} disabled={!preview || me.event.locked || full} title={full ? `${limit}장까지 고를 수 있어요. 다른 사진을 먼저 빼주세요.` : undefined} onClick={() => preview && void save(preview.id, [], "", true)}>{full ? `${limit}장 모두 골랐어요` : `이 사진 고르기${limit > 1 ? ` (${chosen.length}/${need})` : ""}`}</button>}
          </div>
        </div>
        <div className={styles.pcFilmstrip}>
          <button className={`${styles.pcFilmstripArrow} ${styles.pcFilmstripPrevious}`} type="button" aria-label="이전 사진 묶음" onClick={() => scrollFilmstrip(-1)}><ChevronLeft size={20} /></button>
          <div ref={filmstripRef} className={styles.pcThumbs}>{images.map((image) => <button ref={image.id === preview?.id ? activeThumbRef : null} key={image.id} className={`${styles.photoTile} ${image.id === preview?.id ? styles.pcThumbCurrent : ""} ${chosenIds.has(image.id) ? styles.photoTileSelected : ""}`} onClick={() => setPreviewId(image.id)}><img src={image.thumb_url} alt={image.original_file_name} loading="lazy" decoding="async" draggable={false} onContextMenu={(e) => e.preventDefault()} />{chosenIds.has(image.id) ? <span className={styles.check}><Check size={15} /></span> : null}</button>)}</div>
          <button className={`${styles.pcFilmstripArrow} ${styles.pcFilmstripNext}`} type="button" aria-label="다음 사진 묶음" onClick={() => scrollFilmstrip(1)}><ChevronRight size={20} /></button>
        </div>
        <p className={styles.pcKeyboardHint}>← → 사진 이동 · 1 선택 · 0 해제 · Space 사진 고르기</p>
      </div>
      <aside className={styles.pcFeedback}>
        <div className={styles.pcFeedbackScroll}>
          <OfferNotice me={me} />
          <p className={styles.eyebrow}>보정 요청 · {active.label}{need > 1 ? ` · 고른 사진 ${chosen.length}/${need}` : ""}</p>
          {previewChoice ? <>
            <div className={styles.pcChosenPhoto}><img src={previewChoice.thumb_url || ""} alt="고른 사진" decoding="async" draggable={false} onContextMenu={(event) => event.preventDefault()} /><div><strong title={previewChoice.original_file_name}>{shortFileName(previewChoice.original_file_name)}</strong><p className={styles.autoSave}>{savedAt || "자동 저장됨"}</p></div></div>
            <div className={styles.field}><label>보정 체크리스트</label><div className={styles.chipGrid}>{me.event.retouch_options.map((option) => { const selected = keys.includes(option.key); return <button key={option.key} aria-pressed={selected} className={`${styles.chip} ${selected ? styles.chipActive : ""}`} onClick={() => { const next = selected ? keys.filter((key) => key !== option.key) : [...keys, option.key]; setKeys(next); schedule(next, memo); }}>{option.label}</button>; })}</div></div>
            <div className={styles.field}><label>메모</label><textarea className={styles.textarea} maxLength={me.event.memo_max} value={memo} onChange={(e) => { setMemo(e.target.value); schedule(keys, e.target.value); }} /><span className={styles.counter}>{memo.length} / {me.event.memo_max}</span></div>
          </> : <div className={styles.pcFeedbackEmpty}>{chosen.length ? "고른 사진(체크 표시)을 누르면 그 사진의 보정 요청을 적을 수 있어요." : "왼쪽에서 사진을 먼저 골라주세요."}</div>}
          {need > 1 && chosen.length ? <div className={styles.pcThumbs} style={{ marginTop: 14, flexWrap: "wrap", height: "auto", padding: 0, overflow: "visible" }}>{chosen.map((item) => <button key={item.image_id} className={`${styles.photoTile} ${item.image_id === preview?.id ? styles.pcThumbCurrent : ""} ${styles.photoTileSelected}`} onClick={() => setPreviewId(item.image_id)} title={item.original_file_name}><img src={item.thumb_url || ""} alt={item.original_file_name} decoding="async" draggable={false} onContextMenu={(e) => e.preventDefault()} /><span className={styles.check}><Check size={15} /></span></button>)}</div> : null}
        </div>
        <div className={styles.pcSubmitArea}>{(me.event.offers ?? []).length || me.event.extra_price ? <a className={styles.pcOrderLink} href={`/pick/${slug}/order`}><ShoppingBag size={15} /><span>추가 주문{me.order?.lines.length ? ` · ${me.order.lines.map((line) => line.label).join(", ")}` : " · 추가 보정·액자·앨범"}</span><strong>{me.order?.total ? won(me.order.total) : "신청하기"}</strong></a> : null}{missing || submitError ? <p className={styles.submitReason}>{submitError || missingText}</p> : null}<button className={styles.primary} disabled={Boolean(missing) || me.event.locked} onClick={submit}>최종 제출</button></div>
      </aside>
    </div>
  </section>;
}
