"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, ImageIcon, LogOut } from "lucide-react";
import { formatSeoulDeadline } from "@/lib/person-select/date";
import styles from "./PersonSelectPublic.module.css";

type Category = { key: string; label: string; pick: number; image_count: number; choice: Choice | null };
type Choice = { id: string; image_id: string; original_file_name: string; thumb_url: string | null; retouch_keys: string[]; memo: string; updated_at: string };
type EventData = { title: string; slug: string; deadline_at: string; status: string; retouch_options: { key: string; label: string }[]; memo_max: number; locked: boolean };
type MeData = { event: EventData; person: { display_name: string; group_label: string | null; submitted_at: string | null }; categories: Category[] };
type ImageData = { id: string; original_file_name: string; thumb_url: string; preview_url: string; width: number | null; height: number | null };
type PublicEvent = Pick<EventData, "title" | "slug" | "deadline_at" | "status">;
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

function shortFileName(value: string) {
  return value.length > 34 ? `…${value.slice(-32)}` : value;
}

export function PersonSelectLogin({ slug, event }: { slug: string; event: PublicEvent | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
          <h1>선생님의 사진을 직접 골라주세요.</h1>
          <p>졸업앨범에 사용할 사진을 확인하고<br />원하는 보정 내용을 남길 수 있어요.</p>
        </div>
        <div className={styles.stepList}>
          <span><b>1</b> 이름과 비밀번호로 들어가기</span>
          <span><b>2</b> 항목별 사진 한 장 고르기</span>
          <span><b>3</b> 보정 요청을 남기고 제출하기</span>
        </div>
      </div>
      <form className={styles.loginForm} onSubmit={submit}>
        <p className={styles.eyebrow}>개인별 사진 셀렉</p>
        <h2>내 사진 보기</h2>
        <p className={styles.muted}>학교에서 받은 이름과 비밀번호 4자리를 입력해 주세요.</p>
        {event ? <p className={styles.loginDeadline}>마감 {formatSeoulDeadline(event.deadline_at)}</p> : null}
        {event?.status === "draft" ? <div className={styles.error}>아직 열리지 않았어요.</div> : null}
        <div className={styles.field}><label htmlFor="pick-name">이름</label><input id="pick-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="선생님 이름" /></div>
        <div className={styles.field}><label htmlFor="pick-pin">비밀번호</label><input id="pick-pin" className={`${styles.input} ${styles.pin}`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" /></div>
        {error ? <div className={styles.error}>{error}</div> : null}
        <button className={`${styles.primary} ${styles.loginButton}`} disabled={busy || event?.status === "draft" || !name.trim() || pin.length !== 4}>{busy ? "확인하는 중이에요" : "들어가기"}</button>
        <p className={styles.deadline}>비밀번호를 잊었다면 학교 담당 선생님께 문의해 주세요.</p>
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
  const required = visibleCategories.filter((category) => category.pick > 0);
  const completed = required.filter((category) => category.choice).length;
  const missing = required.find((category) => !category.choice);
  const resolvedPcActiveKey = visibleCategories.some((category) => category.key === pcActiveKey) ? pcActiveKey : visibleCategories[0]?.key ?? "profile";

  async function submit() {
    setSubmitError("");
    try { await jsonFetch(`/api/pick/${slug}/submit`, { method: "POST" }); router.push(`/pick/${slug}/done`); }
    catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "제출하지 못했어요."); }
  }

  return <main className={`${styles.page} ${styles.pcHomePage}`}>
    <Header me={me} slug={slug} desktopControls={<>
      <div className={styles.pillbar}>{visibleCategories.map((category) => <button key={category.key} className={`${styles.pill} ${resolvedPcActiveKey === category.key ? styles.pillActive : ""}`} onClick={() => setPcActiveKey(category.key)}>{category.choice ? <Check size={14} aria-hidden="true" /> : null}{category.label}{category.key === "homeroom" && me.person.group_label ? ` · ${me.person.group_label}` : ""}</button>)}</div>
      <strong className={styles.pcHeaderProgress}>{completed} / {required.length} 선택</strong>
    </>} />
    <section className={`${styles.content} ${styles.mobileOnly}`}>
      <div className={styles.hello}><div><p className={styles.eyebrow}>사진 셀렉</p><h1>{me.person.display_name} 선생님</h1><p className={styles.muted}>각 항목에서 사용할 사진을 한 장씩 골라주세요.</p></div><div className={styles.progressText}>{completed} / {required.length} 선택</div></div>
      {me.event.locked ? <div className={styles.notice}>선택이 마감됐어요. 변경이 필요하면 포토클리닉에 연락해 주세요.</div> : null}
      <div className={styles.categoryList}>{visibleCategories.map((category) => {
        return <button key={category.key} className={styles.categoryRow} onClick={() => router.push(`/pick/${slug}/c/${category.key}`)}>
          {category.choice?.thumb_url ? <img className={styles.choiceThumb} src={category.choice.thumb_url} alt="고른 사진" draggable={false} onContextMenu={(e) => e.preventDefault()} /> : <span className={`${styles.choiceThumb} ${styles.emptyThumb}`}><ImageIcon size={21} /></span>}
          <div><h3>{category.label}{category.key === "homeroom" && me.person.group_label ? ` · ${me.person.group_label}` : ""}</h3><p>{category.choice ? shortFileName(category.choice.original_file_name) : `${category.image_count}장 중 1장 선택`}</p></div>
          <span className={`${styles.badge} ${category.choice ? "" : styles.badgePending}`}>{category.choice ? `보정 요청 ${category.choice.retouch_keys.length}개` : "미선택"}</span>
          <ChevronRight size={18} />
        </button>;
      })}</div>
      <div className={styles.stepsCard}><h3>사진 셀렉은 이렇게 진행돼요</h3><div className={styles.stepList}><span><b>1</b>사진 확인</span><span><b>2</b>보정 요청</span><span><b>3</b>최종 제출</span></div></div>
    </section>
    <PcWorkspace slug={slug} me={me} activeKey={resolvedPcActiveKey} reload={() => load({ silent: true })} />
    <footer className={`${styles.submitDock} ${styles.mobileOnly}`}><div className={styles.submitDockInner}>{missing || submitError ? <span className={styles.submitReason}>{submitError || `${missing?.label}을 먼저 골라주세요.`}</span> : null}<button className={styles.primary} disabled={Boolean(missing) || me.event.locked} onClick={submit}>최종 제출 ({completed}/{required.length})</button></div></footer>
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
  const [selected, setSelected] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "selected">("all");
  useEffect(() => { if (category?.choice?.image_id) setSelected(category.choice.image_id); }, [category?.choice?.image_id]);
  if (meLoading || loading) return <main className={styles.darkPage}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  if (!me || !category) return <main className={styles.darkPage}><div className={styles.done}>{error || "항목을 찾을 수 없어요."}</div></main>;
  const currentMe = me;
  const currentCategory = category;

  async function choose(imageId: string) {
    if (currentMe.event.locked) return;
    setSelected(imageId);
    await jsonFetch(`/api/pick/${slug}/choices/${categoryKey}`, { method: "PUT", body: JSON.stringify({ image_id: imageId, retouch_keys: currentCategory.choice?.retouch_keys ?? [], memo: currentCategory.choice?.memo ?? "" }) });
    await load();
  }
  async function clearChoice() {
    if (currentMe.event.locked) return;
    await jsonFetch(`/api/pick/${slug}/choices/${categoryKey}`, { method: "DELETE" });
    setSelected("");
    await load();
  }
  const shown = filter === "selected" ? images.filter((image) => image.id === selected) : images;
  const preview = previewIndex === null ? null : images[previewIndex];
  return <main className={styles.darkPage}>
    <header className={styles.darkTop}><button onClick={() => router.push(`/pick/${slug}/home`)} aria-label="뒤로"><ArrowLeft /></button><strong>{category.label}</strong><span>{images.length}장</span></header>
    <div className={styles.subtabs}><button className={`${styles.subtab} ${filter === "all" ? styles.subtabActive : ""}`} onClick={() => setFilter("all")}>전체 {images.length}</button><button className={`${styles.subtab} ${filter === "selected" ? styles.subtabActive : ""}`} onClick={() => setFilter("selected")}>고른 사진 {selected ? 1 : 0}</button></div>
    {images.length === 0 ? <div className={styles.done}>아직 올라온 사진이 없어요. 포토클리닉에 문의해 주세요.</div> : <div className={styles.photoGrid}>{shown.map((image) => <button key={image.id} className={`${styles.photoTile} ${image.id === selected ? styles.photoTileSelected : ""}`} onClick={() => setPreviewIndex(images.findIndex((item) => item.id === image.id))}><img src={image.thumb_url} alt={image.original_file_name} loading="lazy" decoding="async" draggable={false} onContextMenu={(e) => e.preventDefault()} />{image.id === selected ? <span className={styles.check}><Check size={17} /></span> : null}</button>)}</div>}
    <div className={styles.darkDock}><p>{selected ? "고른 사진의 보정 요청을 적어주세요." : "사진을 먼저 골라주세요"}</p><button className={styles.mintButton} disabled={!selected || me.event.locked} onClick={() => router.push(`/pick/${slug}/c/${categoryKey}/feedback`)}>이 사진으로 보정 요청 쓰기</button></div>
    {preview ? <div className={styles.lightbox}>
      <div className={styles.lightboxTop}><button className={styles.iconButton} onClick={() => setPreviewIndex(null)}><ArrowLeft /></button><strong>{(previewIndex ?? 0) + 1} / {images.length}</strong><span style={{ width: 44 }} /></div>
      <div className={styles.preview}><img src={preview.preview_url} alt={preview.original_file_name} draggable={false} onContextMenu={(e) => e.preventDefault()} /><div className={styles.previewNav}><button className={styles.iconButton} disabled={!previewIndex} onClick={() => setPreviewIndex(Math.max(0, (previewIndex ?? 0) - 1))}><ChevronLeft /></button><button className={styles.iconButton} disabled={previewIndex === images.length - 1} onClick={() => setPreviewIndex(Math.min(images.length - 1, (previewIndex ?? 0) + 1))}><ChevronRight /></button></div></div>
      <div className={styles.lightboxActions}>{preview.id === selected ? <button className={styles.secondary} onClick={() => void clearChoice()}>선택 해제</button> : <button className={styles.secondary} onClick={() => void choose(preview.id)}>이 사진 고르기</button>}<button className={styles.mintButton} disabled={preview.id !== selected} onClick={() => router.push(`/pick/${slug}/c/${categoryKey}/feedback`)}>보정 요청 쓰기</button></div>
    </div> : null}
  </main>;
}

export function PersonSelectFeedback({ slug, categoryKey }: { slug: string; categoryKey: string }) {
  const router = useRouter();
  const { me, loading, error } = useSelectionData(slug);
  const category = me?.categories.find((item) => item.key === categoryKey);
  const [keys, setKeys] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [toast, setToast] = useState("");
  useEffect(() => { if (category?.choice) { setKeys(category.choice.retouch_keys); setMemo(category.choice.memo); } }, [category?.choice]);
  if (loading) return <main className={styles.page}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  if (!me || !category?.choice) return <main className={styles.page}><div className={styles.done}>{error || "사진을 먼저 골라주세요."}</div></main>;
  async function save() {
    try {
      await jsonFetch(`/api/pick/${slug}/choices/${categoryKey}`, { method: "PUT", body: JSON.stringify({ image_id: category!.choice!.image_id, retouch_keys: keys, memo }) });
      router.push(`/pick/${slug}/home`);
    } catch { setToast("저장하지 못했어요. 다시 시도해 주세요."); }
  }
  return <main className={styles.page}>
    <header className={styles.topbar}><button className={styles.weak} onClick={() => router.back()}><ArrowLeft /></button><strong>보정 요청</strong><span style={{ width: 44 }} /></header>
    <section className={styles.feedbackContent}><p className={styles.eyebrow}>{category.label}</p><h1>보정 요청을 남겨주세요.</h1><p className={styles.muted}>원하는 항목을 여러 개 고를 수 있어요.</p>
      <div className={styles.selectedCard}><img src={category.choice.thumb_url || ""} alt="고른 사진" draggable={false} onContextMenu={(e) => e.preventDefault()} /><div><strong>{shortFileName(category.choice.original_file_name)}</strong><p className={styles.muted}>고른 사진</p></div><button className={styles.secondary} onClick={() => router.push(`/pick/${slug}/c/${categoryKey}`)}>다른 사진 고르기</button></div>
      <div className={styles.field}><label>보정 체크리스트</label><div className={styles.chipGrid}>{me.event.retouch_options.map((option) => { const active = keys.includes(option.key); return <button type="button" key={option.key} aria-pressed={active} className={`${styles.chip} ${active ? styles.chipActive : ""}`} onClick={() => setKeys(active ? keys.filter((key) => key !== option.key) : [...keys, option.key])}>{active ? <Check size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> : null}{option.label}</button>; })}</div></div>
      <div className={styles.field}><label htmlFor="pick-memo">메모</label><textarea id="pick-memo" className={styles.textarea} maxLength={me.event.memo_max} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="추가로 원하는 내용을 적어주세요." /><span className={styles.counter}>{memo.length} / {me.event.memo_max}</span></div>
      <p className={styles.feedbackInfo}>아무것도 고르지 않으면 기본 보정(자연스럽게)으로 진행해요.</p>
    </section>
    <footer className={styles.feedbackDock}><div><button className={styles.primary} disabled={me.event.locked} onClick={save}>저장하고 돌아가기</button><small>저장만 돼요. 최종 제출은 홈에서 해주세요.</small></div></footer>
    {toast ? <div className={styles.toast}>{toast}</div> : null}
  </main>;
}

export function PersonSelectDone({ slug }: { slug: string }) {
  const router = useRouter();
  const { me, loading } = useSelectionData(slug);
  if (loading || !me) return <main className={styles.page}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  return <main className={styles.page}><Header me={me} slug={slug} /><section className={styles.done}><div className={styles.doneIcon}><CheckCircle2 /></div><h1>사진 셀렉을 제출했어요.</h1><p className={styles.muted}>마감 전까지 언제든 선택과 보정 요청을 바꿀 수 있어요.</p><div className={styles.summaryList}>{me.categories.filter((category) => category.choice).map((category) => <div className={styles.summaryRow} key={category.key}><img src={category.choice?.thumb_url || ""} alt="고른 사진" draggable={false} onContextMenu={(e) => e.preventDefault()} /><div><strong>{category.label}</strong><p>{category.choice?.original_file_name}</p><small className={styles.muted}>보정 요청 {category.choice?.retouch_keys.length ?? 0}개 · 메모 {category.choice?.memo ? "있음" : "없음"}</small></div></div>)}</div><button className={styles.secondary} onClick={() => router.push(`/pick/${slug}/home`)}>선택 바꾸기</button></section></main>;
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
  const [choice, setChoice] = useState<Choice | null>(active?.choice ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequence = useRef(0);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const firstPhotoMeasured = useRef(false);
  const serverChoice = active?.choice ?? null;
  useEffect(() => {
    setChoice(serverChoice);
    setPreviewId(serverChoice?.image_id || images[0]?.id || "");
    setKeys(serverChoice?.retouch_keys ?? []);
    setMemo(serverChoice?.memo ?? "");
    setSavedAt(serverChoice ? "자동 저장됨" : "");
  }, [activeKey, images, serverChoice]);
  const preview = images.find((image) => image.id === previewId) ?? images[0];
  const previewIndex = preview ? images.findIndex((image) => image.id === preview.id) : -1;
  const save = useCallback(async (imageId: string, nextKeys: string[], nextMemo: string, refreshSummary = false) => {
    if (!active) return;
    const selectedImage = images.find((image) => image.id === imageId);
    if (!selectedImage) return;
    const previous = choice;
    const requestId = ++saveSequence.current;
    const optimisticChoice: Choice = {
      id: previous?.id ?? `pending-${active.key}`,
      image_id: imageId,
      original_file_name: selectedImage.original_file_name,
      thumb_url: selectedImage.thumb_url,
      retouch_keys: nextKeys,
      memo: nextMemo,
      updated_at: new Date().toISOString(),
    };
    setChoice(optimisticChoice);
    setKeys(nextKeys);
    setMemo(nextMemo);
    setSavedAt("저장 중");
    try {
      await jsonFetch(`/api/pick/${slug}/choices/${active.key}`, { method: "PUT", body: JSON.stringify({ image_id: imageId, retouch_keys: nextKeys, memo: nextMemo }) });
      if (requestId === saveSequence.current) setSavedAt("자동 저장됨 · 방금");
      if (refreshSummary) await reload();
    } catch {
      if (requestId === saveSequence.current) {
        setChoice(previous);
        setKeys(previous?.retouch_keys ?? []);
        setMemo(previous?.memo ?? "");
        setSavedAt("저장하지 못했어요. 다시 시도해 주세요.");
      }
    }
  }, [active, choice, images, reload, slug]);
  const clearChoice = useCallback(async () => {
    if (!active) return;
    const previous = choice;
    if (timer.current) clearTimeout(timer.current);
    ++saveSequence.current;
    setChoice(null);
    setKeys([]);
    setMemo("");
    setSavedAt("저장 중");
    try {
      await jsonFetch(`/api/pick/${slug}/choices/${active.key}`, { method: "DELETE" });
      setSavedAt("");
      await reload();
    } catch {
      setChoice(previous);
      setKeys(previous?.retouch_keys ?? []);
      setMemo(previous?.memo ?? "");
      setSavedAt("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }, [active, choice, reload, slug]);
  function schedule(nextKeys: string[], nextMemo: string) { if (!choice?.image_id) return; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void save(choice.image_id, nextKeys, nextMemo), 800); }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (previewIndex < 0) return;
    for (const offset of [-2, -1, 1, 2]) {
      const source = images[previewIndex + offset]?.preview_url;
      if (source) new Image().src = source;
    }
  }, [images, previewIndex]);
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [previewId]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!preview || (event.target instanceof HTMLInputElement) || (event.target instanceof HTMLTextAreaElement)) return;
      const index = images.findIndex((image) => image.id === preview.id);
      if (event.key === "ArrowLeft") { event.preventDefault(); setPreviewId(images[Math.max(0, index - 1)]?.id ?? preview.id); }
      if (event.key === "ArrowRight") { event.preventDefault(); setPreviewId(images[Math.min(images.length - 1, index + 1)]?.id ?? preview.id); }
      if (event.key === " ") { event.preventDefault(); if (preview.id !== choice?.image_id) void save(preview.id, [], "", true); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [choice?.image_id, images, preview, save]);
  if (!active) return null;
  const required = categories.filter((item) => item.pick > 0);
  const missing = required.find((item) => !item.choice);
  async function submit() { await jsonFetch(`/api/pick/${slug}/submit`, { method: "POST" }); window.location.href = `/pick/${slug}/done`; }
  function measureFirstPhoto() {
    if (firstPhotoMeasured.current) return;
    firstPhotoMeasured.current = true;
    const startedAt = Number(window.sessionStorage.getItem(FIRST_PHOTO_TIMER_KEY));
    if (!Number.isFinite(startedAt) || startedAt <= 0) return;
    const milliseconds = Date.now() - startedAt;
    window.sessionStorage.removeItem(FIRST_PHOTO_TIMER_KEY);
    console.info(`[person-select] 로그인 후 첫 사진 표시: ${milliseconds}ms`);
  }
  return <section className={styles.pcWorkspace}>
    <div className={styles.pcBody}>
      <div className={styles.pcPhotos}>
        <div className={styles.pcPreview}>
          <div className={styles.preview}>
            {preview ? <img src={preview.preview_url} alt={preview.original_file_name} onLoad={measureFirstPhoto} draggable={false} onContextMenu={(e) => e.preventDefault()} /> : <span className={styles.pcPhotoEmpty}>아직 올라온 사진이 없어요. 포토클리닉에 문의해 주세요.</span>}
            <div className={styles.pcPreviewInfo}><strong title={preview?.original_file_name}>{preview ? shortFileName(preview.original_file_name) : "사진 없음"}</strong><span>{preview ? `${previewIndex + 1} / ${images.length}` : `0 / ${images.length}`}</span></div>
            <button className={`${styles.pcNavButton} ${styles.pcNavPrevious}`} disabled={previewIndex <= 0} onClick={() => setPreviewId(images[previewIndex - 1]?.id ?? preview?.id ?? "")} aria-label="이전 사진"><ChevronLeft size={20} /></button>
            <button className={`${styles.pcNavButton} ${styles.pcNavNext}`} disabled={previewIndex < 0 || previewIndex >= images.length - 1} onClick={() => setPreviewId(images[previewIndex + 1]?.id ?? preview?.id ?? "")} aria-label="다음 사진"><ChevronRight size={20} /></button>
            {preview?.id === choice?.image_id
              ? <button className={`${styles.pcSelectButton} ${styles.pcSelectButtonSelected}`} disabled={me.event.locked} onClick={() => void clearChoice()} title="선택 해제"><Check size={16} aria-hidden="true" />선택됨</button>
              : <button className={styles.pcSelectButton} disabled={!preview || me.event.locked} onClick={() => preview && void save(preview.id, [], "", true)}>이 사진 고르기</button>}
          </div>
        </div>
        <div className={styles.pcThumbs}>{images.map((image) => <button ref={image.id === preview?.id ? activeThumbRef : null} key={image.id} className={`${styles.photoTile} ${image.id === preview?.id ? styles.pcThumbCurrent : ""} ${image.id === choice?.image_id ? styles.photoTileSelected : ""}`} onClick={() => setPreviewId(image.id)}><img src={image.thumb_url} alt={image.original_file_name} loading="lazy" decoding="async" draggable={false} onContextMenu={(e) => e.preventDefault()} />{image.id === choice?.image_id ? <span className={styles.check}><Check size={15} /></span> : null}</button>)}</div>
        <p className={styles.pcKeyboardHint}>← → 사진 이동 · Space 사진 고르기</p>
      </div>
      <aside className={styles.pcFeedback}>
        <div className={styles.pcFeedbackScroll}>
          <p className={styles.eyebrow}>보정 요청 · {active.label}</p>
          {choice ? <>
            <div className={styles.pcChosenPhoto}><img src={choice.thumb_url || ""} alt="고른 사진" decoding="async" draggable={false} onContextMenu={(event) => event.preventDefault()} /><div><strong title={choice.original_file_name}>{shortFileName(choice.original_file_name)}</strong><p className={styles.autoSave}>{savedAt || "자동 저장됨"}</p></div></div>
            <div className={styles.field}><label>보정 체크리스트</label><div className={styles.chipGrid}>{me.event.retouch_options.map((option) => { const selected = keys.includes(option.key); return <button key={option.key} aria-pressed={selected} className={`${styles.chip} ${selected ? styles.chipActive : ""}`} onClick={() => { const next = selected ? keys.filter((key) => key !== option.key) : [...keys, option.key]; setKeys(next); schedule(next, memo); }}>{option.label}</button>; })}</div></div>
            <div className={styles.field}><label>메모</label><textarea className={styles.textarea} maxLength={me.event.memo_max} value={memo} onChange={(e) => { setMemo(e.target.value); schedule(keys, e.target.value); }} /><span className={styles.counter}>{memo.length} / {me.event.memo_max}</span></div>
          </> : <div className={styles.pcFeedbackEmpty}>왼쪽에서 사진을 먼저 골라주세요.</div>}
        </div>
        <div className={styles.pcSubmitArea}>{missing ? <p className={styles.submitReason}>{missing.label}을 먼저 골라주세요.</p> : null}<button className={styles.primary} disabled={Boolean(missing) || me.event.locked} onClick={submit}>최종 제출</button></div>
      </aside>
    </div>
  </section>;
}
