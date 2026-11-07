"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Folder,
  FolderOpen,
  Images,
  LayoutGrid,
  LoaderCircle,
  MessageCircle,
  Minus,
  PanelLeft,
  Plus,
  RotateCcw,
  Send,
  Star,
  StarOff,
  Sparkles,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  addCustomerBridgeRange,
  applyCustomerColorLabels,
  applyCustomerRatings,
  clearCustomerBridgeMarks,
  customerBridgeFolderTree,
  customerBridgeFolderView,
  normalizeCustomerBridgeSelectionMarks,
  nextCustomerBridgeReviewZoom,
  customerBridgeRatingTargets,
  customerBridgeSelectedIds,
  customerBridgeSelectionItems,
  toggleCustomerColorLabels,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import {
  bridgeReviewDeckWindow,
  bridgeReviewLayout,
  removeBridgeReviewItem,
  restoreBridgeReviewItem,
  type BridgeReviewRemovedItem,
} from "@/lib/photo-bridge/reviewMode";
import {
  bridgeMarqueeSelection,
  bridgeMarqueeUsesAdditiveSelection,
  bridgeRectangleFromPoints,
  bridgeRectanglesIntersect,
} from "@/lib/photo-bridge/marqueeSelection";
import { BRIDGE_COLOR_LABELS } from "@/lib/photo-bridge/labels";
import type { PersonSelectProjectMessage } from "@/lib/person-select/sharedMessages";
import type { PhotoQualityFlag, PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import styles from "./CustomerBridgeSelect.module.css";

export type CustomerBridgeGallery = {
  id: string;
  title: string;
  hospital_name?: string | null;
  shooting_name?: string | null;
  total_jpg_count: number;
  allow_resubmit: boolean;
  download_jpg_enabled?: boolean;
  download_raw_enabled?: boolean;
};

export type CustomerBridgeImage = {
  id: string;
  original_file_name: string;
  relative_path?: string | null;
  thumbnail_url?: string | null;
  image_url: string;
  sort_order: number;
};

export type CustomerBridgeDraft = {
  revision: number;
  selectedImageIds: string[];
  ratings: Record<string, number>;
  colorLabels?: Record<string, number>;
  imageNotes: Record<string, string>;
  customerMemo: string;
  updatedAt?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type PhotoFilter = "all" | "selected" | "unselected" | PhotoQualityFlag | "quality_review" | "quality_normal";
type ReviewRemovedMarks = BridgeReviewRemovedItem & { rating: CustomerBridgeRating | null; colorLabel: CustomerBridgeColorLabel | null };
type SelectionModifiers = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };
type BridgeLocation =
  | { kind: "root" }
  | { kind: "all" }
  | { kind: "folder"; path: string };

const PAGE_SIZE = 240;
const THUMB_MIN = 112;
const THUMB_MAX = 260;
const PREVIEW_CACHE_LIMIT = 12;
const EMPTY_FOLDERS: never[] = [];
const previewImageCache = new Map<string, Promise<void>>();

function touchPreviewCache(url: string, task: Promise<void>) {
  previewImageCache.delete(url);
  previewImageCache.set(url, task);
  while (previewImageCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewImageCache.keys().next().value as string | undefined;
    if (!oldest) break;
    previewImageCache.delete(oldest);
  }
}

function preparePreviewImage(url: string) {
  const cached = previewImageCache.get(url);
  if (cached) {
    touchPreviewCache(url, cached);
    return cached;
  }
  const task = new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
    if (image.complete) resolve();
  });
  touchPreviewCache(url, task);
  return task;
}

function useAdjacentPreviewPreload(images: readonly CustomerBridgeImage[], activeId: string | null, radius = 2) {
  useEffect(() => {
    if (!activeId || typeof window === "undefined") return;
    const index = images.findIndex((image) => image.id === activeId);
    if (index < 0) return;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const candidate = images[index + offset];
      if (candidate) void preparePreviewImage(candidate.image_url);
    }
  }, [activeId, images, radius]);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `bridge_${crypto.randomUUID()}`;
  return `bridge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function reportOptionalStorageError(scope: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") console.debug(`[customer-bridge:${scope}] browser storage unavailable`, error);
}

function RatingStars({
  value,
  onChange,
  label = "고객 별점",
}: {
  value: number;
  onChange?: (rating: 0 | CustomerBridgeRating) => void;
  label?: string;
}) {
  return <div className={styles.ratingStars} role="group" aria-label={label}>
    {[1, 2, 3, 4, 5].map((rating) => <button
      key={rating}
      type="button"
      title={`${rating}점 (${rating})`}
      aria-label={`${rating}점 셀렉`}
      aria-pressed={value >= rating}
      disabled={!onChange}
      onClick={() => onChange?.(rating as CustomerBridgeRating)}
    ><Star size={18} fill={value >= rating ? "currentColor" : "none"} /></button>)}
    <button
      type="button"
      className={styles.ratingClear}
      title="셀렉 해제 (0)"
      aria-label="셀렉 해제 (0)"
      disabled={!onChange || value === 0}
      onClick={() => onChange?.(0)}
    ><StarOff size={18} /></button>
  </div>;
}

function ColorLabels({
  value,
  onChange,
  label = "고객 컬러 셀렉",
}: {
  value: CustomerBridgeColorLabel | null;
  onChange?: (colorLabel: CustomerBridgeColorLabel) => void;
  label?: string;
}) {
  return <div className={styles.colorLabels} role="group" aria-label={label}>
    {(Object.entries(BRIDGE_COLOR_LABELS) as Array<[`${CustomerBridgeColorLabel}`, { name: string; color: string }]>).map(([key, color]) => {
      const colorLabel = Number(key) as CustomerBridgeColorLabel;
      return <button
        key={key}
        type="button"
        title={`${color.name} 컬러 셀렉 (${key})`}
        aria-label={`${color.name} 컬러 셀렉`}
        aria-pressed={value === colorLabel}
        disabled={!onChange}
        style={{ "--customer-label-color": color.color } as CSSProperties}
        onClick={() => onChange?.(colorLabel)}
      ><span />{key}</button>;
    })}
  </div>;
}

function StablePreviewImage({ image, onImageError }: { image: CustomerBridgeImage; onImageError?: (imageId: string) => void }) {
  const [displayed, setDisplayed] = useState(image);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (displayed.id === image.id && displayed.image_url === image.image_url) return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    void preparePreviewImage(image.image_url).then(() => {
      if (requestRef.current !== request) return;
      setDisplayed(image);
      setLoading(false);
    });
  }, [displayed.id, displayed.image_url, image]);

  return <div className={styles.stablePreviewImage} data-loading={loading || undefined}>
    <img src={displayed.image_url} alt={displayed.original_file_name} draggable={false} decoding="async" onError={() => onImageError?.(image.id)} />
    {loading ? <span><LoaderCircle size={20} aria-label="다음 사진 불러오는 중" /></span> : null}
  </div>;
}

const CustomerBridgeThumbnailCard = memo(function CustomerBridgeThumbnailCard({
  image,
  active,
  focused,
  rating,
  colorLabel,
  mobile,
  onClick,
  onImageError,
  quality,
}: {
  image: CustomerBridgeImage;
  active: boolean;
  focused: boolean;
  rating: number;
  colorLabel: CustomerBridgeColorLabel | null;
  mobile: boolean;
  onClick: (image: CustomerBridgeImage, modifiers: SelectionModifiers) => void;
  onImageError?: (imageId: string) => void;
  quality?: PublicPhotoQualityResult;
}) {
  return <article
    role="button"
    tabIndex={0}
    data-bridge-card
    data-bridge-image-id={image.id}
    className={`${styles.thumbnailCard} ${active ? styles.activeThumbnail : ""} ${focused ? styles.focusedThumbnail : ""}`}
    onClick={(event) => onClick(image, event)}
    onKeyDown={(event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      onClick(image, event);
    }}
    aria-label={`${image.original_file_name}${rating ? `, 고객 ${rating}점 셀렉` : ""}${colorLabel ? `, ${BRIDGE_COLOR_LABELS[colorLabel].name} 컬러 셀렉` : ""}${active ? ", 작업 대상" : ""}`}
  >
    <span className={styles.thumbnailMedia}><img src={image.thumbnail_url ?? image.image_url} alt={image.original_file_name} loading="lazy" decoding="async" draggable={false} onError={() => onImageError?.(image.id)} /></span>
    {rating ? <span className={styles.ratingBadge}><Star size={12} fill="currentColor" />{rating}</span> : null}
    {colorLabel ? <span className={styles.colorLabelBadge} style={{ background: BRIDGE_COLOR_LABELS[colorLabel].color }} aria-label={`${BRIDGE_COLOR_LABELS[colorLabel].name} 컬러`} /> : null}
    {quality && (quality.flags.length || quality.status === "needs_review") ? <span className={styles.qualityBadge} title={quality.flags.length ? "AI 품질 문제 의심" : "AI 확인 필요"}><AlertTriangle size={12} />{quality.flags.length || "?"}</span> : null}
    <span className={styles.photoName}>{image.original_file_name}</span>
    {mobile && focused ? <span className={styles.mobileFocusedLabel}>미리보기</span> : null}
  </article>;
});

export default function CustomerBridgeSelect({
  shareToken,
  gallery,
  images: initialImages,
  initialDraft,
  initialSelection,
  onSubmitted,
  apiBase,
  storageScope,
  readOnly = false,
  embedded = false,
  refreshImageUrl,
  reviewer,
  messagesEnabled = false,
  qualityApi,
  canManageQuality = false,
}: {
  shareToken: string;
  gallery: CustomerBridgeGallery;
  images: CustomerBridgeImage[];
  initialDraft?: CustomerBridgeDraft | null;
  initialSelection?: { items?: Array<{ image_id: string; customer_rating?: number | null; customer_color_label?: number | null; memo?: string | null }>; customer_memo?: string | null } | null;
  onSubmitted: (selection: unknown) => void;
  apiBase?: string;
  storageScope?: string;
  readOnly?: boolean;
  embedded?: boolean;
  refreshImageUrl?: (imageId: string) => Promise<Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>;
  reviewer?: { display_name: string; role_label?: string | null; can_finalize?: boolean; can_download_jpg?: boolean; can_download_raw?: boolean } | null;
  messagesEnabled?: boolean;
  qualityApi?: string;
  canManageQuality?: boolean;
}) {
  const endpointBase = apiBase ?? `/api/select/${shareToken}`;
  const localStorageScope = storageScope ?? shareToken;
  const [imageUrlOverrides, setImageUrlOverrides] = useState<Record<string, Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>>({});
  const refreshInFlightRef = useRef(new Map<string, Promise<void>>());
  const images = useMemo(() => initialImages.map((image) => imageUrlOverrides[image.id] ? { ...image, ...imageUrlOverrides[image.id] } : image), [imageUrlOverrides, initialImages]);
  const handleImageError = useCallback((imageId: string) => {
    if (!refreshImageUrl || refreshInFlightRef.current.has(imageId)) return;
    const request = refreshImageUrl(imageId)
      .then((urls) => { setImageUrlOverrides((current) => ({ ...current, [imageId]: urls })); })
      .catch(() => undefined)
      .finally(() => refreshInFlightRef.current.delete(imageId));
    refreshInFlightRef.current.set(imageId, request);
  }, [refreshImageUrl]);
  const imageIds = useMemo(() => new Set(images.map((image) => image.id)), [images]);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const seedMarks = useMemo(() => normalizeCustomerBridgeSelectionMarks({
    selectedImageIds: initialDraft?.selectedImageIds ?? (initialSelection?.items ?? []).map((item) => item.image_id),
    ratings: initialDraft?.ratings
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_rating ?? 0])),
    colorLabels: initialDraft?.colorLabels
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_color_label ?? 0])),
    allowedImageIds: imageIds,
  }), [imageIds, initialDraft, initialSelection]);
  const seedNotes = useMemo(() => initialDraft?.imageNotes
    ?? Object.fromEntries((initialSelection?.items ?? []).filter((item) => item.memo).map((item) => [item.image_id, item.memo ?? ""])), [initialDraft, initialSelection]);

  // 포커스/작업 대상/고객 셀렉은 서로 독립된 상태다.
  const [focusedImageId, setFocusedImageId] = useState<string | null>(null);
  const [activeImageIds, setActiveImageIds] = useState<Set<string>>(() => new Set());
  const [customerRatings, setCustomerRatings] = useState<Record<string, CustomerBridgeRating>>(seedMarks.ratings);
  const [customerColorLabels, setCustomerColorLabels] = useState<Record<string, CustomerBridgeColorLabel>>(seedMarks.colorLabels);
  const [notes, setNotes] = useState<Record<string, string>>(seedNotes);
  const [customerMemo, setCustomerMemo] = useState(initialDraft?.customerMemo ?? initialSelection?.customer_memo ?? "");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PhotoFilter>("all");
  const [thumbSize, setThumbSize] = useState(156);
  const [location, setLocation] = useState<BridgeLocation>({ kind: "root" });
  const [locationReady, setLocationReady] = useState(false);
  const [folderWidth, setFolderWidth] = useState(210);
  const [previewWidth, setPreviewWidth] = useState(320);
  const [compactFoldersOpen, setCompactFoldersOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [renderLimit, setRenderLimit] = useState(PAGE_SIZE);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[] | null>(null);
  const [reviewActiveId, setReviewActiveId] = useState<string | null>(null);
  const [reviewRemoved, setReviewRemoved] = useState<ReviewRemovedMarks | null>(null);
  const [mobile, setMobile] = useState(false);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [sideTab, setSideTab] = useState<"preview" | "chat">("preview");
  const [mobileSideOpen, setMobileSideOpen] = useState(false);
  const [messages, setMessages] = useState<PersonSelectProjectMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [messageState, setMessageState] = useState("");
  const [messageImageScoped, setMessageImageScoped] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [qualityResults, setQualityResults] = useState<Record<string, PublicPhotoQualityResult>>({});
  const [qualityJob, setQualityJob] = useState<Record<string, unknown> | null>(null);
  const [qualityState, setQualityState] = useState("");
  const [downloadState, setDownloadState] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);

  const revisionRef = useRef(initialDraft?.revision ?? 0);
  const dirtyRef = useRef(false);
  const editVersionRef = useRef(0);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const requestKeyRef = useRef(createRequestKey());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sideTabRef = useRef(sideTab);
  const lastMessageIdRef = useRef<string | null>(null);
  const messagesLengthRef = useRef(0);
  const pointerRef = useRef<{
    start: { x: number; y: number };
    initial: Set<string>;
    additive: boolean;
  } | null>(null);

  const folderTree = useMemo(() => customerBridgeFolderTree(images), [images]);
  const rootView = useMemo(() => customerBridgeFolderView(images, ""), [images]);
  const folderView = useMemo(
    () => location.kind === "folder" ? customerBridgeFolderView(images, location.path) : null,
    [images, location],
  );
  const folderImages = useMemo(
    () => location.kind === "all" ? images : location.kind === "folder" ? folderView?.images ?? [] : [],
    [folderView, images, location.kind],
  );
  const childFolders = location.kind === "root" ? rootView.folders : folderView?.folders ?? EMPTY_FOLDERS;
  const customerSelectedIds = useMemo(() => customerBridgeSelectedIds(customerRatings, customerColorLabels), [customerColorLabels, customerRatings]);
  const visibleImages = useMemo(() => folderImages.filter((image) => {
    if (filter === "selected") return customerSelectedIds.has(image.id);
    if (filter === "unselected") return !customerSelectedIds.has(image.id);
    const quality = qualityResults[image.id];
    if (filter === "eyes_closed" || filter === "face_too_dark" || filter === "motion_blur") return quality?.flags.includes(filter) ?? false;
    if (filter === "quality_review") return quality?.status === "needs_review";
    if (filter === "quality_normal") return quality?.status === "normal" || quality?.reviewStatus === "confirmed_normal";
    return true;
  }), [customerSelectedIds, filter, folderImages, qualityResults]);
  const orderedIds = useMemo(() => visibleImages.map((image) => image.id), [visibleImages]);
  const renderedImages = visibleImages.slice(0, renderLimit);
  const selectedInFolder = useMemo(() => folderImages.reduce((count, image) => count + (customerSelectedIds.has(image.id) ? 1 : 0), 0), [customerSelectedIds, folderImages]);
  const qualityCounts = useMemo(() => folderImages.reduce((counts, image) => {
    const quality = qualityResults[image.id];
    if (!quality) return counts;
    for (const flag of quality.flags) counts[flag] += 1;
    if (quality.status === "needs_review") counts.quality_review += 1;
    if (quality.status === "normal" || quality.reviewStatus === "confirmed_normal") counts.quality_normal += 1;
    return counts;
  }, { eyes_closed: 0, face_too_dark: 0, motion_blur: 0, quality_review: 0, quality_normal: 0 }), [folderImages, qualityResults]);
  const focusedImage = focusedImageId ? imageById.get(focusedImageId) ?? null : null;
  const fullscreenImage = fullscreenId ? imageById.get(fullscreenId) ?? null : null;
  const fullscreenIndex = fullscreenId ? visibleImages.findIndex((image) => image.id === fullscreenId) : -1;
  const reviewImages = useMemo(() => (reviewIds ?? []).map((id) => imageById.get(id)).filter(Boolean) as CustomerBridgeImage[], [imageById, reviewIds]);

  useAdjacentPreviewPreload(visibleImages, fullscreenId ?? focusedImageId);
  useAdjacentPreviewPreload(reviewImages, reviewActiveId);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    editVersionRef.current += 1;
    setSaveState("idle");
    setSaveMessage("");
  }, []);

  const loadQuality = useCallback(async (quiet = false) => {
    if (!qualityApi) return;
    try {
      const response = await fetch(qualityApi, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "AI 품질 결과를 불러오지 못했습니다.");
      const next = Object.fromEntries((Array.isArray(result.results) ? result.results : []).map((entry: PublicPhotoQualityResult) => [entry.imageId, entry]));
      setQualityResults(next);
      setQualityJob(result.job ?? null);
      if (!quiet) setQualityState("");
    } catch (error) {
      if (!quiet) setQualityState(error instanceof Error ? error.message : "AI 품질 결과를 불러오지 못했습니다.");
    }
  }, [qualityApi]);

  useEffect(() => { void loadQuality(); }, [loadQuality]);
  useEffect(() => {
    if (!qualityApi || !qualityJob || !["queued", "running"].includes(String(qualityJob.status ?? ""))) return;
    const timer = window.setInterval(() => void loadQuality(true), 2500);
    return () => window.clearInterval(timer);
  }, [loadQuality, qualityApi, qualityJob]);

  const startQuality = useCallback(async () => {
    if (!qualityApi || !canManageQuality) return;
    if (!window.confirm("AI 품질 검사를 위해 1024px 이하 경량 미리보기를 OpenAI API로 전송합니다. 원본 파일은 전송하지 않습니다. 계속할까요?")) return;
    setQualityState("AI 검사를 준비하는 중입니다.");
    const response = await fetch(qualityApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consentAccepted: true }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) { setQualityState(result.error || "AI 검사를 시작하지 못했습니다."); return; }
    setQualityJob(result.job ?? null);
    setQualityState("AI 검사를 시작했습니다. 다른 화면을 사용해도 Worker에서 계속 진행됩니다.");
  }, [canManageQuality, qualityApi]);

  const controlQuality = useCallback(async (action: "pause" | "resume" | "cancel" | "retry") => {
    if (!qualityApi || !canManageQuality) return;
    const response = await fetch(qualityApi, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) { setQualityState(result.error || "AI 검사 상태를 바꾸지 못했습니다."); return; }
    setQualityJob(result.job ?? null);
    setQualityState(action === "pause" ? "AI 검사를 일시정지했습니다." : action === "resume" ? "AI 검사를 이어서 진행합니다." : action === "retry" ? "실패한 사진만 다시 검사합니다." : "AI 검사를 취소했습니다.");
  }, [canManageQuality, qualityApi]);

  const reviewQuality = useCallback(async (imageId: string, reviewStatus: "confirmed_issue" | "confirmed_normal") => {
    if (!qualityApi || !canManageQuality) return;
    const response = await fetch(qualityApi, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId, reviewStatus }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) { setQualityState(result.error || "AI 판정 검토를 저장하지 못했습니다."); return; }
    setQualityResults((current) => ({ ...current, [imageId]: result.result }));
  }, [canManageQuality, qualityApi]);

  const downloadSelected = useCallback(async (format: "jpg" | "raw") => {
    if (readOnly || downloadBusy || !customerSelectedIds.size) return;
    setDownloadBusy(true);
    setDownloadState(`${format.toUpperCase()} 원본 다운로드를 준비하는 중입니다.`);
    try {
      const response = await fetch(`${endpointBase}/downloads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: [...customerSelectedIds], format, requestKey: `download_${createRequestKey()}` }),
      });
      const created = await response.json().catch(() => ({}));
      if (!response.ok || !created.ok) throw new Error(created.error || "다운로드 작업을 만들지 못했습니다.");
      const jobId = String(created.job?.id ?? "");
      if (!jobId) throw new Error("다운로드 작업 ID가 없습니다.");
      for (let attempt = 0; attempt < 600; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const statusResponse = await fetch(`${endpointBase}/downloads?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const status = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok || !status.ok) throw new Error(status.error || "다운로드 상태를 확인하지 못했습니다.");
        setDownloadState(`${Number(status.job?.completed_count ?? 0).toLocaleString("ko-KR")} / ${Number(status.job?.total_count ?? customerSelectedIds.size).toLocaleString("ko-KR")}장 준비`);
        if (status.downloadUrl) { window.location.assign(String(status.downloadUrl)); setDownloadState("다운로드를 시작했습니다."); return; }
        if (["failed", "canceled", "expired"].includes(String(status.job?.status ?? ""))) throw new Error(status.job?.error || "다운로드 준비에 실패했습니다.");
      }
      throw new Error("다운로드 준비 시간이 초과됐습니다. 잠시 뒤 다시 시도해 주세요.");
    } catch (error) {
      setDownloadState(error instanceof Error ? error.message : "다운로드에 실패했습니다.");
    } finally { setDownloadBusy(false); }
  }, [customerSelectedIds, downloadBusy, endpointBase, readOnly]);

  const applyRatingTo = useCallback((targetIds: ReadonlySet<string>, rating: 0 | CustomerBridgeRating) => {
    if (readOnly || !targetIds.size) return;
    if (rating === 0) {
      setCustomerRatings((current) => clearCustomerBridgeMarks(current, targetIds));
      setCustomerColorLabels((current) => clearCustomerBridgeMarks(current, targetIds));
    } else setCustomerRatings((current) => applyCustomerRatings(current, targetIds, rating));
    markDirty();
  }, [markDirty, readOnly]);

  const applyColorTo = useCallback((targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => {
    if (readOnly || !targetIds.size) return;
    setCustomerColorLabels((current) => applyCustomerColorLabels(current, targetIds, colorLabel));
    markDirty();
  }, [markDirty, readOnly]);

  const toggleColorTo = useCallback((targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => {
    if (readOnly || !targetIds.size) return;
    setCustomerColorLabels((current) => toggleCustomerColorLabels(current, targetIds, colorLabel));
    markDirty();
  }, [markDirty, readOnly]);

  const applyMainRating = useCallback((rating: 0 | CustomerBridgeRating) => {
    applyRatingTo(customerBridgeRatingTargets(activeImageIds, focusedImageId), rating);
  }, [activeImageIds, applyRatingTo, focusedImageId]);

  const applyMainColor = useCallback((colorLabel: CustomerBridgeColorLabel) => {
    toggleColorTo(customerBridgeRatingTargets(activeImageIds, focusedImageId), colorLabel);
  }, [activeImageIds, focusedImageId, toggleColorTo]);

  const moveFullscreen = useCallback((delta: -1 | 1) => {
    if (!visibleImages.length) return;
    const current = fullscreenIndex >= 0 ? fullscreenIndex : 0;
    const next = visibleImages[(current + delta + visibleImages.length) % visibleImages.length];
    setFullscreenId(next.id);
    setFocusedImageId(next.id);
    setZoomed(false);
  }, [fullscreenIndex, visibleImages]);

  const openReview = useCallback(() => {
    const ids = images.filter((image) => customerSelectedIds.has(image.id)).map((image) => image.id);
    if (!ids.length) return;
    setReviewIds(ids);
    setReviewActiveId(focusedImageId && ids.includes(focusedImageId) ? focusedImageId : ids[0]);
    setReviewRemoved(null);
  }, [customerSelectedIds, focusedImageId, images]);

  const removeFromReview = useCallback((id: string) => {
    if (!reviewIds) return;
    const rating = customerRatings[id] ?? null;
    const colorLabel = customerColorLabels[id] ?? null;
    if (!rating && !colorLabel) return;
    const removed = removeBridgeReviewItem(reviewIds, id);
    setReviewIds(removed.remainingIds);
    setReviewActiveId(removed.nextActiveId);
    setReviewRemoved(removed.removed ? { ...removed.removed, rating, colorLabel } : null);
    applyRatingTo(new Set([id]), 0);
  }, [applyRatingTo, customerColorLabels, customerRatings, reviewIds]);

  const restoreReviewItem = useCallback(() => {
    if (!reviewIds || !reviewRemoved) return;
    const restored = restoreBridgeReviewItem(reviewIds, reviewRemoved);
    setReviewIds(restored.restoredIds);
    setReviewActiveId(restored.activeId);
    if (reviewRemoved.rating) applyRatingTo(new Set([reviewRemoved.id]), reviewRemoved.rating);
    if (reviewRemoved.colorLabel) applyColorTo(new Set([reviewRemoved.id]), reviewRemoved.colorLabel);
    setReviewRemoved(null);
  }, [applyColorTo, applyRatingTo, reviewIds, reviewRemoved]);

  const saveDraft = useCallback(async (options?: { quiet?: boolean }) => {
    if (readOnly) return true;
    if (saveInFlightRef.current) await saveInFlightRef.current;
    if (!dirtyRef.current && options?.quiet) return true;
    const controller = new AbortController();
    saveAbortRef.current = controller;
    const editVersion = editVersionRef.current;
    const request = (async () => {
      setSaveState("saving");
      setSaveMessage("저장 중");
      try {
        const response = await fetch(`${endpointBase}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ revision: revisionRef.current, items: customerBridgeSelectionItems(images, customerRatings, customerColorLabels, notes), customerMemo }),
        });
        const result = await response.json();
        if (response.status === 409) {
          setSaveState("conflict");
          setSaveMessage("다른 화면에서 변경됨 · 새로고침 후 확인해 주세요");
          return false;
        }
        if (!response.ok || !result.ok) throw new Error(result.error ?? "선택을 저장하지 못했습니다.");
        revisionRef.current = Number(result.draft?.revision ?? revisionRef.current + 1);
        const latest = editVersionRef.current === editVersion;
        if (latest) dirtyRef.current = false;
        setSaveState(latest ? "saved" : "idle");
        setSaveMessage(latest ? "저장됨" : "추가 변경 저장 대기");
        try { localStorage.removeItem(`customer-bridge-draft:${localStorageScope}`); } catch (error) { reportOptionalStorageError("draft-clear", error); }
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        setSaveState("error");
        setSaveMessage(error instanceof Error ? error.message : "저장 실패 · 다시 시도");
        try {
          localStorage.setItem(`customer-bridge-draft:${localStorageScope}`, JSON.stringify({ selectedImageIds: [...customerBridgeSelectedIds(customerRatings, customerColorLabels)], ratings: customerRatings, colorLabels: customerColorLabels, imageNotes: notes, customerMemo }));
        } catch (storageError) { reportOptionalStorageError("draft-backup", storageError); }
        return false;
      }
    })();
    saveInFlightRef.current = request;
    try { return await request; }
    finally {
      if (saveInFlightRef.current === request) saveInFlightRef.current = null;
      if (saveAbortRef.current === controller) saveAbortRef.current = null;
    }
  }, [customerColorLabels, customerMemo, customerRatings, endpointBase, images, localStorageScope, notes, readOnly]);

  useEffect(() => {
    if (readOnly || !dirtyRef.current) return;
    const timer = window.setTimeout(() => { void saveDraft({ quiet: true }); }, 550);
    return () => window.clearTimeout(timer);
  }, [customerColorLabels, customerMemo, customerRatings, notes, readOnly, saveDraft]);

  useEffect(() => () => saveAbortRef.current?.abort(), []);

  useEffect(() => {
    if (readOnly || initialDraft || initialSelection) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`customer-bridge-draft:${localStorageScope}`) || "null") as { selectedImageIds?: string[]; ratings?: Record<string, number>; colorLabels?: Record<string, number>; imageNotes?: Record<string, string>; customerMemo?: string } | null;
      if (!stored) return;
      const restored = normalizeCustomerBridgeSelectionMarks({
        selectedImageIds: stored.selectedImageIds,
        ratings: stored.ratings,
        colorLabels: stored.colorLabels,
        allowedImageIds: imageIds,
      });
      setCustomerRatings(restored.ratings);
      setCustomerColorLabels(restored.colorLabels);
      setNotes(stored.imageNotes ?? {});
      setCustomerMemo(stored.customerMemo ?? "");
      dirtyRef.current = true;
      setSaveState("error");
      setSaveMessage("기기에 보관한 선택을 복구했습니다 · 다시 저장 중");
    } catch (error) { reportOptionalStorageError("draft-restore", error); }
  }, [imageIds, initialDraft, initialSelection, localStorageScope, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    try {
      const storageKey = `customer-bridge-submit-key:${localStorageScope}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) requestKeyRef.current = stored;
      else localStorage.setItem(storageKey, requestKeyRef.current);
    } catch (error) { reportOptionalStorageError("submit-key", error); }
  }, [localStorageScope, readOnly]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    sideTabRef.current = sideTab;
    if (sideTab === "chat") {
      setUnreadMessages(0);
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: "end" }));
    }
  }, [messages.length, sideTab]);

  const loadMessages = useCallback(async (options?: { quiet?: boolean }) => {
    if (!messagesEnabled) return;
    try {
      const response = await fetch(`${endpointBase}/messages`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "대화를 불러오지 못했습니다.");
      const next = Array.isArray(result.messages) ? result.messages as PersonSelectProjectMessage[] : [];
      const nextLastId = next.at(-1)?.id ?? null;
      if (lastMessageIdRef.current && nextLastId && lastMessageIdRef.current !== nextLastId && sideTabRef.current !== "chat") {
        setUnreadMessages((count) => count + Math.max(1, next.length - messagesLengthRef.current));
      }
      lastMessageIdRef.current = nextLastId;
      messagesLengthRef.current = next.length;
      setMessages(next);
      setMessageState("");
      if (sideTabRef.current === "chat") requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: "end" }));
    } catch (error) {
      if (!options?.quiet) setMessageState(error instanceof Error ? error.message : "대화 연결을 확인해 주세요.");
    }
  }, [endpointBase, messagesEnabled]);

  useEffect(() => {
    if (!messagesEnabled) return;
    void loadMessages();
    const events = new EventSource(`${endpointBase}/messages/events`);
    const refresh = () => void loadMessages({ quiet: true });
    events.addEventListener("changed", refresh);
    events.addEventListener("ready", refresh);
    events.onerror = () => setMessageState("대화 연결을 다시 시도하는 중입니다.");
    const fallback = window.setInterval(refresh, 12_000);
    return () => {
      window.clearInterval(fallback);
      events.close();
    };
  }, [endpointBase, loadMessages, messagesEnabled]);

  const sendMessage = useCallback(async () => {
    const body = messageText.trim();
    if (!messagesEnabled || !body || sendingMessage) return;
    setSendingMessage(true);
    setMessageState("전송 중");
    try {
      const response = await fetch(`${endpointBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, requestId: `message_${createRequestKey()}`, imageId: messageImageScoped ? focusedImageId : null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "메시지를 보내지 못했습니다.");
      setMessageText("");
      await loadMessages({ quiet: true });
      setMessageState("");
    } catch (error) {
      setMessageState(error instanceof Error ? error.message : "메시지를 보내지 못했습니다.");
    } finally {
      setSendingMessage(false);
    }
  }, [endpointBase, focusedImageId, loadMessages, messageImageScoped, messageText, messagesEnabled, sendingMessage]);

  useEffect(() => {
    const node = sentinelRef.current;
    const root = gridRef.current;
    if (!node || !root || renderLimit >= visibleImages.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setRenderLimit((current) => Math.min(visibleImages.length, current + PAGE_SIZE));
    }, { root, rootMargin: "700px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [renderLimit, visibleImages.length]);

  useEffect(() => {
    setRenderLimit(PAGE_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  }, [filter, location]);

  useEffect(() => {
    if (locationReady) return;
    try {
      const value = sessionStorage.getItem(`customer-bridge-location:${localStorageScope}`);
      if (value === "all") setLocation({ kind: "all" });
      else if (value?.startsWith("folder:")) {
        const path = value.slice(7);
        if (path === "" || folderTree.some((folder) => folder.path === path)) setLocation({ kind: "folder", path });
      }
    } catch (error) { reportOptionalStorageError("location-restore", error); }
    finally { setLocationReady(true); }
  }, [folderTree, localStorageScope, locationReady]);

  useEffect(() => {
    if (!locationReady) return;
    try {
      const value = location.kind === "folder" ? `folder:${location.path}` : location.kind;
      sessionStorage.setItem(`customer-bridge-location:${localStorageScope}`, value);
    } catch (error) { reportOptionalStorageError("location-save", error); }
  }, [localStorageScope, location, locationReady]);

  const openLocation = useCallback((nextLocation: BridgeLocation) => {
    setLocation(nextLocation);
    const next = nextLocation.kind === "all"
      ? images
      : nextLocation.kind === "folder"
        ? customerBridgeFolderView(images, nextLocation.path).images
        : [];
    setFocusedImageId(next[0]?.id ?? null);
    setActiveImageIds(new Set());
    setAnchorId(null);
    setCompactFoldersOpen(false);
  }, [images]);

  const goToParentFolder = useCallback(() => {
    if (location.kind === "root") return;
    if (location.kind === "all") {
      openLocation({ kind: "root" });
      return;
    }
    const parent = location.path.split("/").slice(0, -1).join("/");
    openLocation(parent ? { kind: "folder", path: parent } : { kind: "root" });
  }, [location, openLocation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        if (fullscreenId) setFullscreenId(null);
        else if (reviewIds) setReviewIds(null);
        else if (mobileSideOpen) setMobileSideOpen(false);
        else setCompactFoldersOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        openReview();
        return;
      }
      if (event.key === " " && (reviewActiveId || focusedImageId)) {
        event.preventDefault();
        setFullscreenId(reviewActiveId ?? focusedImageId);
        return;
      }
      if (!readOnly && /^[0-9]$/.test(event.key)) {
        const value = Number(event.key);
        const targets = reviewIds && reviewActiveId
          ? new Set([reviewActiveId])
          : fullscreenId
            ? new Set([fullscreenId])
            : customerBridgeRatingTargets(activeImageIds, focusedImageId);
        if (!targets.size) return;
        event.preventDefault();
        if (value >= 6 && value <= 9) {
          const colorLabel = value as CustomerBridgeColorLabel;
          if (reviewIds && reviewActiveId && customerColorLabels[reviewActiveId] === colorLabel && !customerRatings[reviewActiveId]) {
            removeFromReview(reviewActiveId);
          } else {
            toggleColorTo(targets, colorLabel);
          }
          return;
        }
        if (value > 5) return;
        const rating = value as 0 | CustomerBridgeRating;
        if (reviewIds && reviewActiveId) {
          if (rating === 0) removeFromReview(reviewActiveId);
          else applyRatingTo(new Set([reviewActiveId]), rating);
          return;
        }
        if (fullscreenId) {
          applyRatingTo(new Set([fullscreenId]), rating);
          return;
        }
        applyRatingTo(targets, rating);
        return;
      }
      if (reviewIds) {
        if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && reviewIds.length) {
          event.preventDefault();
          const index = Math.max(0, reviewIds.indexOf(reviewActiveId ?? reviewIds[0]));
          const delta = event.key === "ArrowLeft" ? -1 : 1;
          setReviewActiveId(reviewIds[(index + delta + reviewIds.length) % reviewIds.length]);
        } else if (event.key === "ArrowDown" && reviewActiveId) {
          event.preventDefault();
          removeFromReview(reviewActiveId);
        } else if (event.key === "ArrowUp" && reviewRemoved) {
          event.preventDefault();
          restoreReviewItem();
        }
        return;
      }
      if (fullscreenId && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        moveFullscreen(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (!focusedImageId || !event.key.startsWith("Arrow")) return;
      const currentIndex = orderedIds.indexOf(focusedImageId);
      if (currentIndex < 0) return;
      const columns = Math.max(1, Math.floor((gridRef.current?.clientWidth ?? thumbSize) / (thumbSize + 10)));
      const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns : columns;
      const nextId = orderedIds[Math.max(0, Math.min(orderedIds.length - 1, currentIndex + delta))];
      if (!nextId) return;
      event.preventDefault();
      if (event.shiftKey && !readOnly) setActiveImageIds((current) => addCustomerBridgeRange({ current, orderedIds, anchorId: anchorId ?? focusedImageId, targetId: nextId }));
      else setAnchorId(nextId);
      setFocusedImageId(nextId);
      gridRef.current?.querySelector<HTMLElement>(`[data-bridge-image-id="${CSS.escape(nextId)}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeImageIds, anchorId, applyRatingTo, customerColorLabels, customerRatings, focusedImageId, fullscreenId, mobileSideOpen, moveFullscreen, openReview, orderedIds, readOnly, removeFromReview, restoreReviewItem, reviewActiveId, reviewIds, reviewRemoved, thumbSize, toggleColorTo]);

  const handlePhotoClick = useCallback((image: CustomerBridgeImage, event: SelectionModifiers) => {
    setFocusedImageId(image.id);
    if (mobile) {
      setFullscreenId(image.id);
      return;
    }
    if (event.shiftKey && anchorId) {
      setActiveImageIds((current) => addCustomerBridgeRange({ current, orderedIds, anchorId, targetId: image.id }));
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      setActiveImageIds((current) => {
        const next = new Set(current);
        if (next.has(image.id)) next.delete(image.id);
        else next.add(image.id);
        return next;
      });
    } else setActiveImageIds(new Set([image.id]));
    setAnchorId(image.id);
  }, [anchorId, mobile, orderedIds]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || mobile || event.button !== 0 || (event.target as HTMLElement).closest("button,[data-bridge-card]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      start: { x: event.clientX - rect.left + event.currentTarget.scrollLeft, y: event.clientY - rect.top + event.currentTarget.scrollTop },
      initial: new Set(activeImageIds),
      additive: bridgeMarqueeUsesAdditiveSelection(event),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    const root = gridRef.current;
    if (!pointer || !root) return;
    const rect = root.getBoundingClientRect();
    const end = { x: event.clientX - rect.left + root.scrollLeft, y: event.clientY - rect.top + root.scrollTop };
    const box = bridgeRectangleFromPoints(pointer.start, end);
    setMarquee({ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top });
    const hits = new Set<string>();
    root.querySelectorAll<HTMLElement>("[data-bridge-image-id]").forEach((node) => {
      const nodeRect = node.getBoundingClientRect();
      const candidate = { left: nodeRect.left - rect.left + root.scrollLeft, top: nodeRect.top - rect.top + root.scrollTop, right: nodeRect.right - rect.left + root.scrollLeft, bottom: nodeRect.bottom - rect.top + root.scrollTop };
      if (bridgeRectanglesIntersect(box, candidate)) hits.add(node.dataset.bridgeImageId ?? "");
    });
    setActiveImageIds(bridgeMarqueeSelection({ initial: pointer.initial, hits, additive: pointer.additive }));
  };

  const handlePointerUp = () => {
    pointerRef.current = null;
    setMarquee(null);
  };

  const beginResize = (pane: "folder" | "preview", event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = pane === "folder" ? folderWidth : previewWidth;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (pane === "folder") setFolderWidth(Math.max(160, Math.min(340, start + delta)));
      else setPreviewWidth(Math.max(250, Math.min(520, start - delta)));
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  const submit = async () => {
    const selectedCount = customerSelectedIds.size;
    if (!selectedCount || submitting) return;
    if (!window.confirm(`${selectedCount}장을 최종 제출할까요?`)) return;
    setSubmitting(true);
    const saved = await saveDraft();
    if (!saved) { setSubmitting(false); return; }
    try {
      const response = await fetch(`${endpointBase}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: revisionRef.current, requestKey: requestKeyRef.current, items: customerBridgeSelectionItems(images, customerRatings, customerColorLabels, notes), customerMemo }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "최종 제출에 실패했습니다.");
      requestKeyRef.current = createRequestKey();
      try { localStorage.removeItem(`customer-bridge-submit-key:${localStorageScope}`); } catch (error) { reportOptionalStorageError("submit-key-clear", error); }
      onSubmitted(result.selection);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "최종 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const workspaceStyle = { "--bridge-folder-width": `${folderWidth}px`, "--bridge-preview-width": `${previewWidth}px` } as CSSProperties;
  const locationLabel = location.kind === "root" ? "프로젝트" : location.kind === "all" ? "전체 사진" : location.path || "루트 사진";
  const locationCount = location.kind === "root" ? childFolders.length + (rootView.images.length ? 1 : 0) : visibleImages.length;

  return <main className={`${styles.page} ${embedded ? styles.embedded : ""} ${readOnly ? styles.readOnly : ""}`}>
    <header className={styles.bridgeBar}>
      <div><strong>Olivia Bridge</strong><span>고객 사진 셀렉</span></div>
      <div className={styles.projectTitle}><strong>{gallery.shooting_name ?? gallery.title}</strong><span>{[reviewer ? `${reviewer.display_name}${reviewer.role_label ? ` · ${reviewer.role_label}` : ""}` : gallery.hospital_name, `${images.length.toLocaleString("ko-KR")}장`].filter(Boolean).join(" · ")}</span></div>
      <div className={styles.saveState} data-state={saveState}>{readOnly ? "관리자 사진 확인" : saveMessage || "변경하면 자동 저장됩니다"}</div>
    </header>

    <div className={styles.pathBar}>
      <button type="button" className={styles.mobileFolderButton} aria-expanded={compactFoldersOpen} onClick={() => setCompactFoldersOpen(true)}><PanelLeft size={15} /> 폴더</button>
      <button type="button" className={styles.backButton} disabled={location.kind === "root"} onClick={goToParentFolder} aria-label="상위 폴더로"><ChevronLeft size={16} /></button>
      <nav className={styles.breadcrumbs} aria-label="현재 폴더">
        <FolderOpen size={15} />
        <button type="button" aria-current={location.kind === "root" ? "page" : undefined} onClick={() => openLocation({ kind: "root" })}>{gallery.title}</button>
        {location.kind === "all" ? <><ChevronRight size={12} /><strong>전체 사진</strong></> : null}
        {location.kind === "folder" && !location.path ? <><ChevronRight size={12} /><strong>루트 사진</strong></> : null}
        {location.kind === "folder" ? folderView?.breadcrumbs.map((crumb, index) => <span key={crumb.path}><ChevronRight size={12} /><button type="button" aria-current={index === (folderView?.breadcrumbs.length ?? 0) - 1 ? "page" : undefined} onClick={() => openLocation({ kind: "folder", path: crumb.path })}>{crumb.name}</button></span>) : null}
      </nav>
      {location.kind !== "root" ? <div className={styles.topFilters} aria-label="고객 셀렉 필터">
        {(["all", "selected", "unselected"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? `전체 ${folderImages.length}` : value === "selected" ? `고객 셀렉 ${selectedInFolder}` : `미선택 ${folderImages.length - selectedInFolder}`}</button>)}
      </div> : null}
      {gallery.download_jpg_enabled && !readOnly ? <button type="button" className={styles.headerAction} disabled={!customerSelectedIds.size || downloadBusy} title={downloadState || "고객 셀렉 원본 JPG를 ZIP으로 준비합니다."} onClick={() => void downloadSelected("jpg")}><Download size={14} /> {downloadBusy ? "준비 중" : "JPG 원본"}</button> : null}
      {gallery.download_raw_enabled && !readOnly ? <button type="button" className={styles.headerAction} disabled={!customerSelectedIds.size || downloadBusy} title={downloadState || "고객 셀렉 RAW를 ZIP으로 준비합니다."} onClick={() => void downloadSelected("raw")}><Download size={14} /> {downloadBusy ? "준비 중" : "RAW 원본"}</button> : null}
      {messagesEnabled ? <button type="button" className={`${styles.headerAction} ${styles.mobileChatAction}`} onClick={() => { setSideTab("chat"); setMobileSideOpen(true); }}><MessageCircle size={14} /> 대화{unreadMessages ? ` ${unreadMessages}` : ""}</button> : null}
      {qualityApi && canManageQuality ? <button type="button" className={styles.headerAction} disabled={["queued", "running", "paused"].includes(String(qualityJob?.status ?? ""))} onClick={() => void startQuality()}><Sparkles size={14} /> {["queued", "running"].includes(String(qualityJob?.status ?? "")) ? "AI 검사 중" : qualityJob?.status === "paused" ? "AI 검사 정지" : "AI 검사 시작"}</button> : null}
      <button type="button" className={styles.headerAction} disabled={!customerSelectedIds.size} onClick={openReview}><Images size={14} /> 리뷰</button>
      <button type="button" className={styles.headerAction} disabled={!focusedImageId} onClick={() => setFullscreenId(focusedImageId)}><Expand size={14} /> 전체화면</button>
    </div>

    <section className={styles.workspace} style={workspaceStyle}>
      {compactFoldersOpen ? <button type="button" className={styles.folderBackdrop} aria-label="폴더 닫기" onClick={() => setCompactFoldersOpen(false)} /> : null}
      <aside className={styles.folderPanel} data-compact-open={compactFoldersOpen || undefined}>
        <div className={styles.panelTitle}><span>폴더</span><button type="button" onClick={() => setCompactFoldersOpen(false)} aria-label="폴더 닫기"><X size={15} /></button></div>
        <button type="button" className={location.kind === "root" ? styles.rootFolderActive : styles.rootFolder} onClick={() => openLocation({ kind: "root" })}><FolderOpen size={17} /><span>프로젝트</span><b>{rootView.folders.length}</b></button>
        <button type="button" className={`${styles.rootFolder} ${location.kind === "all" ? styles.rootFolderActive : ""}`} onClick={() => openLocation({ kind: "all" })}><Images size={17} /><span>전체 사진</span><b>{images.length}</b></button>
        <div className={styles.folderList}>
          {rootView.images.length ? <button type="button" className={location.kind === "folder" && location.path === "" ? styles.activeFolder : ""} onClick={() => openLocation({ kind: "folder", path: "" })}><FolderOpen size={15} /><span>루트 사진</span><b>{rootView.images.length}</b></button> : null}
          {folderTree.map((folder) => <button key={folder.path} type="button" className={location.kind === "folder" && location.path === folder.path ? styles.activeFolder : ""} style={{ "--folder-depth": folder.depth } as CSSProperties} onClick={() => openLocation({ kind: "folder", path: folder.path })}><Folder size={15} /><span>{folder.name}</span><b>{folder.totalCount}</b></button>)}
        </div>
        <div className={styles.filterList}><small>고객 셀렉</small>{(["all", "selected", "unselected"] as const).map((value) => <button key={value} type="button" className={filter === value ? styles.activeFilter : ""} disabled={location.kind === "root"} onClick={() => setFilter(value)}><span>{value === "all" ? "전체 사진" : value === "selected" ? "선택한 사진" : "선택하지 않은 사진"}</span><b>{location.kind === "root" ? "–" : value === "all" ? folderImages.length : value === "selected" ? selectedInFolder : folderImages.length - selectedInFolder}</b></button>)}</div>
        {qualityApi ? <div className={styles.filterList}><small>AI 품질 검사</small>{([
          ["eyes_closed", "눈감음 의심"],
          ["face_too_dark", "얼굴 어두움 의심"],
          ["motion_blur", "흔들림 의심"],
          ["quality_review", "확인 필요"],
          ["quality_normal", "정상"],
        ] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? styles.activeFilter : ""} disabled={location.kind === "root"} onClick={() => setFilter(value)}><span>{label}</span><b>{location.kind === "root" ? "–" : qualityCounts[value]}</b></button>)}{qualityState ? <p className={styles.qualityState}>{qualityState}</p> : null}{qualityJob ? <p className={styles.qualityState}>{String(qualityJob.status ?? "")} · {Number(qualityJob.completed_count ?? 0).toLocaleString("ko-KR")} / {Number(qualityJob.total_count ?? 0).toLocaleString("ko-KR")}</p> : null}{canManageQuality && qualityJob && ["queued", "running"].includes(String(qualityJob.status ?? "")) ? <button type="button" onClick={() => void controlQuality("pause")}><span>검사 일시정지</span></button> : null}{canManageQuality && qualityJob?.status === "paused" ? <button type="button" onClick={() => void controlQuality("resume")}><span>검사 계속</span></button> : null}{canManageQuality && qualityJob && ["failed", "partial_failed"].includes(String(qualityJob.status ?? "")) ? <button type="button" onClick={() => void controlQuality("retry")}><span>실패 사진 재시도</span></button> : null}</div> : null}
        <div className={styles.folderSummary}><span>전체<b>{images.length}</b></span><span>작업 대상<b>{activeImageIds.size}</b></span><span>고객 셀렉<b>{customerSelectedIds.size}</b></span></div>
      </aside>

      <button type="button" className={styles.paneDivider} aria-label="폴더 패널 너비 조절" onPointerDown={(event) => beginResize("folder", event)} />

      <section className={styles.browserPanel}>
        <header className={styles.browserHeader}><div><strong>{locationLabel}</strong><span>{location.kind === "root" ? `${locationCount}개 폴더` : `${visibleImages.length.toLocaleString("ko-KR")}장`}</span></div>{location.kind !== "root" ? <div className={styles.thumbnailControls}><button type="button" onClick={() => setThumbSize((size) => Math.max(THUMB_MIN, size - 12))} aria-label="썸네일 작게"><Minus size={15} /></button><LayoutGrid size={16} /><button type="button" onClick={() => setThumbSize((size) => Math.min(THUMB_MAX, size + 12))} aria-label="썸네일 크게"><Plus size={15} /></button></div> : null}</header>
        <div ref={gridRef} className={styles.fileArea} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
          {childFolders.length || (location.kind === "root" && rootView.images.length) ? <div className={styles.folderCardGrid}>
            {location.kind === "root" && rootView.images.length ? <button type="button" className={styles.folderCard} onClick={() => openLocation({ kind: "folder", path: "" })}>
              <span className={styles.folderCardMedia}><Folder size={24} /></span><span><strong>루트 사진</strong><small>{rootView.images.length.toLocaleString("ko-KR")}장</small></span>
            </button> : null}
            {childFolders.map((folder) => <button type="button" key={folder.path} className={styles.folderCard} onClick={() => openLocation({ kind: "folder", path: folder.path })}>
              <span className={styles.folderCardMedia}><Folder size={24} /></span><span><strong>{folder.name}</strong><small>{folder.totalCount.toLocaleString("ko-KR")}장</small></span>
            </button>)}
          </div> : null}
          <div className={styles.thumbnailGrid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}>
            {renderedImages.map((image) => {
              const active = activeImageIds.has(image.id);
              const focused = focusedImageId === image.id;
              const rating = customerRatings[image.id] ?? 0;
              const colorLabel = customerColorLabels[image.id] ?? null;
              return <CustomerBridgeThumbnailCard key={image.id} image={image} active={active} focused={focused} rating={rating} colorLabel={colorLabel} mobile={mobile} quality={qualityResults[image.id]} onClick={handlePhotoClick} onImageError={handleImageError} />;
            })}
          </div>
          {location.kind !== "root" && !visibleImages.length && !childFolders.length ? <div className={styles.empty}>이 폴더에 표시할 사진이 없습니다.</div> : null}
          {marquee ? <div className={styles.selectionMarquee} style={marquee} /> : null}<div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        </div>
        <footer className={styles.shortcutBar}><span>클릭 작업 대상 · Shift 범위 · ⌘/Ctrl 추가 · 1–5 별점 · 6–9 컬러 · 0 해제 · ⌘/Ctrl+B 리뷰</span>{location.kind !== "root" ? <label>썸네일 <input type="range" min={THUMB_MIN} max={THUMB_MAX} step={4} value={thumbSize} onChange={(event) => setThumbSize(Number(event.currentTarget.value))} /></label> : null}</footer>
      </section>

      <button type="button" className={styles.paneDivider} aria-label="미리보기 패널 너비 조절" onPointerDown={(event) => beginResize("preview", event)} />

      <aside className={styles.previewPanel} data-mobile-open={mobileSideOpen || undefined}>
        <nav className={styles.sideTabs} role="tablist" aria-label="오른쪽 패널">
          <button type="button" role="tab" aria-selected={sideTab === "preview"} onClick={() => setSideTab("preview")}>미리보기</button>
          {messagesEnabled ? <button type="button" role="tab" aria-selected={sideTab === "chat"} onClick={() => setSideTab("chat")}><MessageCircle size={14} />대화{unreadMessages ? <b>{unreadMessages}</b> : null}</button> : null}
          <button type="button" className={styles.mobileSideClose} onClick={() => setMobileSideOpen(false)} aria-label="오른쪽 패널 닫기"><X size={16} /></button>
        </nav>
        {sideTab === "preview" ? <>
          <header><strong>미리보기</strong><span>{activeImageIds.size ? `작업 대상 ${activeImageIds.size}장` : focusedImage ? "현재 사진" : "사진을 선택해 주세요"}</span></header>
          {focusedImage ? <><div className={styles.previewCanvas} onDoubleClick={() => setFullscreenId(focusedImage.id)}><button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => { const index = orderedIds.indexOf(focusedImage.id); const next = orderedIds[Math.max(0, index - 1)]; if (next) setFocusedImageId(next); }} disabled={orderedIds.indexOf(focusedImage.id) <= 0} aria-label="이전 사진"><ChevronLeft size={20} /></button><StablePreviewImage image={focusedImage} onImageError={handleImageError} /><button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => { const index = orderedIds.indexOf(focusedImage.id); const next = orderedIds[Math.min(orderedIds.length - 1, index + 1)]; if (next) setFocusedImageId(next); }} disabled={orderedIds.indexOf(focusedImage.id) >= orderedIds.length - 1} aria-label="다음 사진"><ChevronRight size={20} /></button></div>
            <div className={styles.previewMeta}><strong>{focusedImage.original_file_name}</strong><span>{focusedImage.relative_path ?? ""}</span><button type="button" onClick={() => setFullscreenId(focusedImage.id)}><Expand size={13} /> 크게 보기</button></div>
            {qualityResults[focusedImage.id] ? <section className={styles.qualityPanel}><header><strong>AI 품질 분석</strong><span>{qualityResults[focusedImage.id].reviewStatus === "confirmed_normal" ? "정상 확인됨" : qualityResults[focusedImage.id].reviewStatus === "confirmed_issue" ? "문제 확인됨" : "검토 보조"}</span></header>{(["eyes_closed", "face_too_dark", "motion_blur"] as const).map((flag) => <div key={flag} data-suspected={qualityResults[focusedImage.id].flags.includes(flag) || undefined}><span>{flag === "eyes_closed" ? "눈감음" : flag === "face_too_dark" ? "얼굴 어두움" : "흔들림"}</span><b>{qualityResults[focusedImage.id].flags.includes(flag) ? "의심" : qualityResults[focusedImage.id].status === "needs_review" ? "확인 필요" : "정상"}</b></div>)}{canManageQuality ? <footer><button type="button" onClick={() => void reviewQuality(focusedImage.id, "confirmed_issue")}>문제 확인</button><button type="button" onClick={() => void reviewQuality(focusedImage.id, "confirmed_normal")}>정상으로 확인</button></footer> : null}<small>AI 결과는 별점·셀렉·파일을 자동 변경하지 않습니다.</small></section> : null}
            {!readOnly ? <div className={styles.previewControls}><div><span>{activeImageIds.size > 1 ? `${activeImageIds.size}장에 셀렉 적용` : "고객 셀렉"}</span><RatingStars value={customerRatings[focusedImage.id] ?? 0} onChange={applyMainRating} /><ColorLabels value={customerColorLabels[focusedImage.id] ?? null} onChange={applyMainColor} /></div><label>사진별 보정 메모<textarea value={notes[focusedImage.id] ?? ""} maxLength={1000} onChange={(event) => { setNotes((current) => ({ ...current, [focusedImage.id]: event.target.value })); markDirty(); }} placeholder="이 사진에 필요한 보정 내용을 적어주세요." /></label></div> : <div className={styles.readOnlyMarks}>{customerRatings[focusedImage.id] ? <span><Star size={13} fill="currentColor" />{customerRatings[focusedImage.id]}점</span> : null}{customerColorLabels[focusedImage.id] ? <span><i style={{ background: BRIDGE_COLOR_LABELS[customerColorLabels[focusedImage.id]].color }} />{BRIDGE_COLOR_LABELS[customerColorLabels[focusedImage.id]].name}</span> : null}{notes[focusedImage.id] ? <p className={styles.readOnlyMemo}>{notes[focusedImage.id]}</p> : null}</div>}
          </> : <div className={styles.previewEmpty}><Images size={34} /><strong>미리 볼 사진을 선택해 주세요</strong></div>}
        </> : <section className={styles.chatPanel} aria-label="프로젝트 대화">
          <div className={styles.messageList}>{messages.map((message) => <article key={message.id} data-own={message.own || undefined}><header><strong>{message.authorName}</strong>{message.authorRole ? <span>{message.authorRole}</span> : null}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></header>{message.imageId ? <button type="button" className={styles.messageImageLink} onClick={() => { setFocusedImageId(message.imageId); setSideTab("preview"); }}>{message.imageName || "연결 사진 보기"}</button> : null}<p>{message.body}</p></article>)}{!messages.length ? <div className={styles.chatEmpty}>프로젝트 사진에 관해 함께 이야기해 보세요.</div> : null}<div ref={messagesEndRef} /></div>
          {messagesEnabled ? <form className={styles.messageComposer} onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><label className={styles.messageScope}><input type="checkbox" checked={messageImageScoped} disabled={!focusedImageId} onChange={(event) => setMessageImageScoped(event.target.checked)} />{focusedImage ? `현재 사진 · ${focusedImage.original_file_name}` : "현재 사진 없음"}</label><textarea value={messageText} maxLength={2000} placeholder="메시지를 입력하세요" onChange={(event) => setMessageText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} /><button type="submit" disabled={!messageText.trim() || sendingMessage} aria-label="메시지 보내기"><Send size={16} /></button></form> : null}
          {messageState ? <p className={styles.messageState}>{messageState}</p> : null}
        </section>}
      </aside>
    </section>

    {!readOnly ? <footer className={styles.footer}><div className={styles.footerSummary}><strong>전체 {images.length.toLocaleString("ko-KR")}장 · 고객 셀렉 {customerSelectedIds.size.toLocaleString("ko-KR")}장</strong><span>{downloadState || saveMessage || (reviewer?.can_finalize === false ? "검토 내용은 자동 저장됩니다 · 최종 확정 권한 없음" : "자동 저장")}</span></div><button className={styles.reviewButton} type="button" disabled={!customerSelectedIds.size} onClick={openReview}>리뷰</button><button className={styles.submitButton} type="button" disabled={!customerSelectedIds.size || submitting || saveState === "conflict" || reviewer?.can_finalize === false} onClick={() => void submit()}>{reviewer?.can_finalize === false ? "확정 권한 없음" : submitting ? "제출 중" : "최종 제출"}</button></footer> : null}

    {fullscreenImage ? <PhotoOverlay image={fullscreenImage} index={fullscreenIndex} total={visibleImages.length} rating={customerRatings[fullscreenImage.id] ?? 0} colorLabel={customerColorLabels[fullscreenImage.id] ?? null} note={notes[fullscreenImage.id] ?? ""} zoomed={zoomed} onZoom={() => setZoomed((value) => !value)} onClose={() => setFullscreenId(null)} onPrev={() => moveFullscreen(-1)} onNext={() => moveFullscreen(1)} onRate={(rating) => applyRatingTo(new Set([fullscreenImage.id]), rating)} onColor={(colorLabel) => toggleColorTo(new Set([fullscreenImage.id]), colorLabel)} onNote={(value) => { setNotes((current) => ({ ...current, [fullscreenImage.id]: value })); markDirty(); }} onImageError={handleImageError} readOnly={readOnly} /> : null}
    {reviewIds ? <ReviewOverlay images={reviewImages} activeId={reviewActiveId} removed={reviewRemoved} ratings={customerRatings} colorLabels={customerColorLabels} onActive={setReviewActiveId} onClose={() => setReviewIds(null)} onRemove={removeFromReview} onRestore={restoreReviewItem} onRate={(id, rating) => rating === 0 ? removeFromReview(id) : applyRatingTo(new Set([id]), rating)} onColor={(id, colorLabel) => customerColorLabels[id] === colorLabel && !customerRatings[id] ? removeFromReview(id) : toggleColorTo(new Set([id]), colorLabel)} onFullscreen={(id) => setFullscreenId(id)} onImageError={handleImageError} /> : null}
  </main>;
}

function PhotoOverlay({ image, index, total, rating, colorLabel, note, zoomed, onZoom, onClose, onPrev, onNext, onRate, onColor, onNote, onImageError, readOnly }: { image: CustomerBridgeImage; index: number; total: number; rating: number; colorLabel: CustomerBridgeColorLabel | null; note: string; zoomed: boolean; onZoom: () => void; onClose: () => void; onPrev: () => void; onNext: () => void; onRate: (rating: 0 | CustomerBridgeRating) => void; onColor: (colorLabel: CustomerBridgeColorLabel) => void; onNote: (value: string) => void; onImageError?: (imageId: string) => void; readOnly: boolean; }) {
  const touchStart = useRef<number | null>(null);
  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="사진 전체화면" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (delta > 55) onPrev(); else if (delta < -55) onNext(); touchStart.current = null; }}><div className={styles.overlayHeader}><button type="button" aria-label="닫기" onClick={onClose}><X /></button><div><strong>{image.original_file_name}</strong><span>{Math.max(0, index) + 1} / {total} · {rating ? `고객 ${rating}점` : colorLabel ? `${BRIDGE_COLOR_LABELS[colorLabel].name} 컬러` : "미선택"}</span></div><button type="button" onClick={onZoom}>{zoomed ? "화면 맞춤" : "확대"}</button></div><div className={zoomed ? styles.overlayImageZoomed : styles.overlayImage} onDoubleClick={onZoom}><button type="button" aria-label="이전" onClick={onPrev}><ChevronLeft /></button><StablePreviewImage image={image} onImageError={onImageError} /><button type="button" aria-label="다음" onClick={onNext}><ChevronRight /></button></div>{!readOnly ? <div className={styles.overlayControls}><RatingStars value={rating} onChange={onRate} label="전체화면 고객 별점" /><ColorLabels value={colorLabel} onChange={onColor} label="전체화면 고객 컬러 셀렉" /><strong>{rating || colorLabel ? "고객 셀렉" : "별점이나 컬러를 눌러 고객 셀렉"}</strong><textarea value={note} maxLength={1000} onChange={(event) => onNote(event.target.value)} placeholder="사진별 보정 메모" /></div> : null}</div>;
}

function ReviewOverlay({ images, activeId, removed, ratings, colorLabels, onActive, onClose, onRemove, onRestore, onRate, onColor, onFullscreen, onImageError }: { images: CustomerBridgeImage[]; activeId: string | null; removed: ReviewRemovedMarks | null; ratings: Record<string, CustomerBridgeRating>; colorLabels: Record<string, CustomerBridgeColorLabel>; onActive: (id: string) => void; onClose: () => void; onRemove: (id: string) => void; onRestore: () => void; onRate: (id: string, rating: 0 | CustomerBridgeRating) => void; onColor: (id: string, colorLabel: CustomerBridgeColorLabel) => void; onFullscreen: (id: string) => void; onImageError?: (imageId: string) => void; }) {
  const touchStart = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const layout = bridgeReviewLayout(images.length);
  const activeIndex = Math.max(0, images.findIndex((image) => image.id === activeId));
  const displayed = layout === "deck" ? bridgeReviewDeckWindow(images, activeIndex) : images.map((image) => ({ item: image, offset: 0 }));
  const move = (delta: -1 | 1) => { if (images.length) onActive(images[(activeIndex + delta + images.length) % images.length].id); };
  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.deltaY) return;
    setZoom((current) => nextCustomerBridgeReviewZoom(current, event.deltaY));
  }, []);
  useEffect(() => setZoom(1), [activeId, layout]);
  return <div className={styles.reviewOverlay} role="dialog" aria-modal="true" aria-label="고객 셀렉 리뷰"><div className={styles.overlayHeader}><button type="button" aria-label="닫기" onClick={onClose}><X /></button><div><strong>고객 셀렉 리뷰</strong><span>{images.length}장 · {layout === "single" ? "한 장" : layout === "grid" ? "비교" : "로테이션"} · {Math.round(zoom * 100)}%</span></div><button type="button" disabled={!removed} onClick={onRestore}><RotateCcw size={15} /> 복원</button></div><div className={`${styles.reviewStage} ${styles[`review_${layout}`]}`} title="마우스 휠 위로 확대 · 아래로 축소" onWheel={handleWheel} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (delta > 55) move(-1); else if (delta < -55) move(1); touchStart.current = null; }}>{displayed.map(({ item, offset }) => { const style = { ...(layout === "deck" ? { "--deck-offset": offset } : {}), ...(item.id === activeId ? { "--review-zoom": zoom } : {}) } as CSSProperties; return <button key={item.id} type="button" className={styles.reviewPhoto} data-active={item.id === activeId || undefined} style={style} onClick={() => onActive(item.id)} onDoubleClick={() => onFullscreen(item.id)}><StablePreviewImage image={item} onImageError={onImageError} /><span>{item.original_file_name}{ratings[item.id] ? ` · ${ratings[item.id]}점` : ""}{colorLabels[item.id] ? ` · ${BRIDGE_COLOR_LABELS[colorLabels[item.id]].name}` : ""}</span></button>; })}{!images.length ? <div className={styles.reviewEmpty}>모든 사진을 제외했습니다. 위의 복원으로 직전 사진의 별점과 컬러를 되돌릴 수 있습니다.</div> : null}</div>{activeId ? <div className={styles.reviewControls}><button type="button" className={styles.reviewMoveButton} onClick={() => move(-1)} aria-label="이전 사진"><ChevronLeft size={17} /></button><RatingStars value={ratings[activeId] ?? 0} onChange={(rating) => onRate(activeId, rating)} label="리뷰 고객 별점" /><ColorLabels value={colorLabels[activeId] ?? null} onChange={(colorLabel) => onColor(activeId, colorLabel)} label="리뷰 고객 컬러 셀렉" /><button type="button" className={styles.reviewMoveButton} onClick={() => move(1)} aria-label="다음 사진"><ChevronRight size={17} /></button><button type="button" className={styles.removeButton} onClick={() => onRemove(activeId)}>셀렉 제외</button></div> : null}</div>;
}
