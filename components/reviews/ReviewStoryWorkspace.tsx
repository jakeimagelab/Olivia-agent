"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, Building2, Check, ChevronDown,
  Crop, Download, Eye, EyeOff, GripVertical, Highlighter, ImagePlus, Italic, Layers3, LayoutTemplate,
  Lock, Minus, MoreHorizontal, Palette, Plus, Quote, Redo2, Save, Send, SlidersHorizontal,
  Sparkles, Star, Trash2, Type, Underline, Undo2, Unlock, Upload, WandSparkles, ZoomIn, ZoomOut,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { createMailingDraft } from "@/lib/mailingQueue";
import {
  createBlankReviewStoryDocument, createReviewCoverDocument, createReviewDesignDocument,
  createReviewStoryDocument, duplicateStoryElement, isReviewStoryDocument,
  resizeReviewStoryDocument, REVIEW_STORY_CANVAS_SIZES, reviewStoryCanvasRatio,
  toReviewStoryTemplateDocument,
  type ReviewCoverPreset, type ReviewDesignPreset, type ReviewStoryDocument, type ReviewStoryElement,
  type ReviewStoryCanvasRatio, type ReviewStoryImageElement, type ReviewStoryPageType, type ReviewStoryTemplateConfig,
} from "@/lib/reviewContent/storyDocument";
import ReviewStoryCanvas, { type ReviewStoryCanvasHandle } from "./ReviewStoryCanvas";
import ReviewCanvasThumbnail from "./canvas/ReviewCanvasThumbnail";
import ReviewCanvasExportHost, { type ReviewCanvasExportHostHandle } from "./canvas/ReviewCanvasExportHost";
import { useDesktopWindowMode } from "@/lib/desktopWindowContext";
import { useOliviaUiSurface } from "@/lib/olivia/surfaceContext";
import ReviewTemplateThumbnail from "./ReviewTemplateThumbnail";
import Modal from "@/components/ui/Modal";
import styles from "./ReviewStoryWorkspace.module.css";

type Review = {
  id: string;
  client_id?: string;
  hospital_name: string;
  reviewer_name?: string;
  review_text: string;
  delivered_at?: string;
  permission_to_publish?: boolean;
  rating?: number | null;
};

function formatShortDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\s/g, "").replace(/\.$/, "");
}

type LayoutAsset = {
  id: string;
  name: string;
  description?: string;
  layout_config?: ReviewStoryTemplateConfig;
  thumbnailUrl?: string | null;
};

type Variant = {
  id: string;
  image_storage_path: string | null;
  imageUrl?: string | null;
  sort_order: number;
  is_selected?: boolean;
  layout_asset_id?: string | null;
  generation_metadata?: Record<string, any>;
  assetUrls?: Record<string, string>;
  review_layout_assets?: LayoutAsset | null;
};

type ReviewContent = {
  id: string;
  review_id: string;
  status: string;
  summary: string;
  caption: string;
  hashtags: string;
  carousel?: Array<{ title?: string; body?: string }>;
  selected_variant_id?: string | null;
  client_reviews?: {
    id?: string;
    public_review_text?: string;
    good_points?: string;
    writer_name?: string;
    delivered_at?: string;
    clients?: { hospital_name?: string; name?: string } | null;
  } | null;
  review_content_variants?: Variant[];
};

type PhotoAsset = { id: string; name: string; src: string; storagePath: string };
type StoryPage = Variant & {
  document: ReviewStoryDocument;
  pageType: ReviewStoryPageType;
  pageName: string;
};

type GeneratedBackgroundAsset = {
  assetId: string;
  storagePath: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  source: "ai";
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// app/layout.tsx에서 이미 전역으로 로드해 둔 폰트만 나열한다(새 웹폰트 로딩 없음).
const FONT_OPTIONS = [
  { value: "var(--font-sans)", label: "Pretendard (기본)" },
  { value: "'NanumSquare', 'Noto Sans KR', sans-serif", label: "나눔스퀘어" },
  { value: "'Noto Sans KR', sans-serif", label: "Noto Sans KR" },
  { value: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", label: "Apple SD 고딕" },
  { value: "'Nanum Myeongjo', serif", label: "나눔명조" },
  { value: "Georgia, 'Nanum Myeongjo', serif", label: "Georgia 세리프" },
  { value: "'Black Han Sans', sans-serif", label: "Black Han Sans" },
  { value: "'Do Hyeon', sans-serif", label: "Do Hyeon" },
  { value: "'Gothic A1', sans-serif", label: "Gothic A1" },
  { value: "'Song Myung', serif", label: "Song Myung" },
];

const CANVAS_RATIO_OPTIONS = Object.entries(REVIEW_STORY_CANVAS_SIZES) as Array<[
  ReviewStoryCanvasRatio,
  (typeof REVIEW_STORY_CANVAS_SIZES)[ReviewStoryCanvasRatio],
]>;

const TEMPLATE_PREVIEW_SOURCE = {
  reviewText: "고객의 이야기가 자연스럽게 담기는 리뷰 콘텐츠입니다.",
  hospitalName: "OLIVIA CLINIC",
  doctorName: "",
  date: "2026.09.12",
};

const COVER_PRESETS: Array<{ value: ReviewCoverPreset; label: string; description: string }> = [
  { value: "minimal", label: "미니멀", description: "여백과 타이포 중심" },
  { value: "editorial", label: "에디토리얼", description: "세리프와 따뜻한 아이보리" },
  { value: "photo", label: "포토 커버", description: "대표 사진을 가득 사용" },
  { value: "typography", label: "타이포그래피", description: "딥그린 브랜드 문구" },
];

const DESIGN_PRESETS: Array<{ value: ReviewDesignPreset; label: string; description: string }> = [
  { value: "cta", label: "CTA 카드", description: "상담과 예약을 자연스럽게 유도" },
  { value: "brand", label: "브랜드 문구", description: "브랜드 메시지를 크게 강조" },
  { value: "quote", label: "스토리 카드", description: "감성적인 인용 문구 페이지" },
];

const AI_STYLE_OPTIONS = [
  ["minimal", "미니멀"], ["clinic", "클리닉"], ["editorial", "에디토리얼"],
  ["luxury", "럭셔리"], ["natural", "내추럴"],
] as const;
const AI_TONE_OPTIONS = [
  ["white", "화이트"], ["cream", "크림"], ["mint", "민트"], ["beige", "베이지"], ["deep-green", "딥그린"],
] as const;
const AI_TEXTURE_OPTIONS = [
  ["paper", "종이 질감"], ["shadow", "은은한 그림자"], ["botanical", "식물 / 자연"], ["marble", "마블"], ["fabric", "패브릭"],
] as const;

function contentSource(content: ReviewContent) {
  const review = content.client_reviews || {};
  return {
    reviewText: review.public_review_text || review.good_points || content.summary || "후기 내용을 입력해 주세요.",
    hospitalName: review.clients?.hospital_name || review.clients?.name || "병원",
    doctorName: review.writer_name || "",
    date: review.delivered_at || "",
  };
}

function pagesFromContent(content: ReviewContent, layouts: LayoutAsset[]): StoryPage[] {
  const source = contentSource(content);
  return [...(content.review_content_variants || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((variant) => {
      const metadata = variant.generation_metadata || {};
      const stored = metadata.editorDocument;
      const layout = variant.review_layout_assets || layouts.find((item) => item.id === variant.layout_asset_id);
      const pageType: ReviewStoryPageType = (["review", "cover", "free"] as const).includes(metadata.pageType)
        ? metadata.pageType
        : "review";
      return {
        ...variant,
        pageType,
        pageName: metadata.pageName || (pageType === "cover" ? "커버 페이지" : pageType === "free" ? "자유 페이지" : "리뷰 페이지"),
        document: isReviewStoryDocument(stored)
          ? clone(stored)
          : createReviewStoryDocument(source, layout?.layout_config || {}),
      };
    });
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function ToolbarRange({
  label, value, min, max, step, onChange, format = (current) => String(current),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className={styles.toolbarRange} title={`${label} ${format(value)}`}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{format(value)}</output>
    </label>
  );
}

export default function ReviewStoryWorkspace() {
  // OS 창 안에서는 타이틀바가 이미 "리뷰콘텐츠"를 보여주므로 본문 h1/설명은 중복이다
  // (제안서 1.1) — standalone /review-studio 라우트에서는 그대로 유지.
  const isDesktopWindow = useDesktopWindowMode();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [contents, setContents] = useState<ReviewContent[]>([]);
  const [layouts, setLayouts] = useState<LayoutAsset[]>([]);
  const [activeContentId, setActiveContentId] = useState("");
  const [activePageId, setActivePageId] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [pages, setPages] = useState<StoryPage[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [generationCount, setGenerationCount] = useState(6);
  // 100 = "맞춤"(가운데 컬럼에 꽉 차게 계산된 fit scale). ReviewStoryCanvas가 이 값을
  // 실제 스테이지 크기 기준 fitScale에 곱해서 최종 캔버스 픽셀 크기를 정하므로, 컬럼 폭이
  // 아무리 넓어져도 캔버스가 화면을 뒤덮지 않는다.
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState("");
  const [pngMenuOpen, setPngMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<ReviewStoryDocument[]>([]);
  const [future, setFuture] = useState<ReviewStoryDocument[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState({ hospitalName: "", doctorName: "", date: "", reviewText: "" });
  const [rightTab, setRightTab] = useState<"props" | "layers">("props");
  const [lockAspectRatio, setLockAspectRatio] = useState(false);
  const [studioModal, setStudioModal] = useState<"cover" | "page" | "design" | "template" | "ai" | null>(null);
  const [aiStyle, setAiStyle] = useState<"minimal" | "clinic" | "editorial" | "luxury" | "natural">("minimal");
  const [aiTone, setAiTone] = useState<"white" | "cream" | "mint" | "beige" | "deep-green">("cream");
  const [aiTextures, setAiTextures] = useState<string[]>(["paper", "shadow"]);
  const [aiPrompt, setAiPrompt] = useState("은은한 창문 그림자와 따뜻한 아이보리 종이 질감");
  const [backgroundAssets, setBackgroundAssets] = useState<GeneratedBackgroundAsset[]>([]);
  const workspaceRef = useRef<HTMLElement>(null);
  const [workspaceHeight, setWorkspaceHeight] = useState<number | null>(null);
  const uiSurface = useOliviaUiSurface();
  const canvasHandleRef = useRef<ReviewStoryCanvasHandle>(null);
  const exportHostRefs = useRef<Map<string, ReviewCanvasExportHostHandle>>(new Map());

  // 위(GlobalHeader/PcrmSubNav) 높이가 "고객관리와 연결되지 않은 신규 작업입니다" 배너처럼
  // 조건부로 나타나는 요소 때문에 고정값이 아니다 — CSS calc(100dvh - Npx)로 고정폭을 빼면
  // 배너가 뜰 때마다 어긋난다. 실제 뷰포트에서 이 요소가 시작하는 y좌표를 재서 남은 높이를
  // 직접 계산하면 위쪽 chrome이 얼마나 늘어나든 페이지 스크롤 없이 항상 맞는다.
  useEffect(() => {
    const node = workspaceRef.current;
    if (!node) return;
    // 760px 이하는 CSS 미디어쿼리가 이 영역을 height:auto(자연 스크롤)로 되돌리는 모바일 스택
    // 레이아웃이라, 그 구간에서는 인라인 높이를 넣지 않아야 CSS가 이긴다.
    const update = () => {
      if (window.innerWidth <= 760) {
        setWorkspaceHeight(null);
        return;
      }
      const availableHeight = uiSurface === "tablet"
        ? node.parentElement?.clientHeight ?? window.innerHeight - node.getBoundingClientRect().top
        : window.innerHeight - node.getBoundingClientRect().top;
      setWorkspaceHeight(availableHeight);
    };
    update();
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(uiSurface === "tablet" && node.parentElement ? node.parentElement : document.body);
    return () => { window.removeEventListener("resize", update); observer.disconnect(); };
  }, [uiSurface]);

  const activeContent = useMemo(() => contents.find((item) => item.id === activeContentId) || null, [contents, activeContentId]);
  const activePage = useMemo(() => pages.find((page) => page.id === activePageId) || pages[0] || null, [pages, activePageId]);
  const selectedElement = useMemo(() => activePage?.document.elements.find((element) => element.id === selectedElementId) || null, [activePage, selectedElementId]);
  const selectedReview = useMemo(() => reviews.find((review) => review.id === selectedReviewId) || null, [reviews, selectedReviewId]);
  const templatePreviews = useMemo(() => new Map(layouts.map((layout) => [
    layout.id,
    createReviewStoryDocument(TEMPLATE_PREVIEW_SOURCE, layout.layout_config || {}),
  ])), [layouts]);

  useEffect(() => { setRightTab("props"); }, [selectedElementId]);

  useEffect(() => {
    if (studioModal !== "ai" || backgroundAssets.length) return;
    void jsonRequest("/api/review-content/background/generate", { cache: "no-store" })
      .then((result) => setBackgroundAssets(result.assets || []))
      .catch(() => undefined);
  }, [backgroundAssets.length, studioModal]);

  const notify = useCallback((value: string, isError = false) => {
    setMessage(value);
    setError(isError);
  }, []);

  const load = useCallback(async (preferredContentId?: string) => {
    const [reviewsResult, contentsResult, layoutsResult] = await Promise.all([
      jsonRequest("/api/reviews", { cache: "no-store" }),
      jsonRequest("/api/review-contents", { cache: "no-store" }),
      jsonRequest("/api/review-layout-assets", { cache: "no-store" }),
    ]);
    const nextReviews = reviewsResult.reviews || [];
    let nextContents = contentsResult.contents || [];
    const nextLayouts = layoutsResult.assets || [];
    setLayouts(nextLayouts);
    setSelectedTemplateIds((current) => current.length ? current.filter((id) => nextLayouts.some((layout: LayoutAsset) => layout.id === id)) : nextLayouts.slice(0, 3).map((layout: LayoutAsset) => layout.id));

    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const queryContentId = params?.get("contentId") || "";
    const queryReviewId = params?.get("reviewId") || "";

    let targetContentId = preferredContentId || queryContentId;
    // 리뷰 관리 목록의 [콘텐츠 만들기]는 ?reviewId=만 들고 온다 — 그 리뷰의 콘텐츠가 이미
    // 있으면 그대로 열고, 없으면 여기서 만든 뒤(findOrCreateReviewContent) 목록을 다시
    // 불러와서 연다. 상세 페이지 없이 바로 에디터로 온다는 게 이 흐름의 핵심이라, 빈 에디터가
    // 잠깐 보이지 않도록 이 await가 끝날 때까지 아래 setContents를 미룬다.
    if (!targetContentId && queryReviewId) {
      const linked = nextContents.find((item: ReviewContent) => item.review_id === queryReviewId);
      if (linked) {
        targetContentId = linked.id;
      } else {
        const created = await jsonRequest(`/api/reviews/${queryReviewId}/content`, { method: "POST" });
        targetContentId = created.contentId;
        const refreshed = await jsonRequest("/api/review-contents", { cache: "no-store" });
        nextContents = refreshed.contents || [];
      }
    }

    setReviews(nextReviews);
    setContents(nextContents);
    const fallbackToFirst = !queryReviewId && !queryContentId && !preferredContentId;
    const nextContent = nextContents.find((item: ReviewContent) => item.id === (targetContentId || activeContentId))
      || (fallbackToFirst ? nextContents[0] : null)
      || null;
    if (nextContent) {
      const nextPages = pagesFromContent(nextContent, nextLayouts);
      const nextSource = contentSource(nextContent);
      setActiveContentId(nextContent.id);
      setSelectedReviewId(nextContent.review_id);
      setPages(nextPages);
      setActivePageId((current) => nextPages.some((page) => page.id === current) ? current : nextPages[0]?.id || "");
      setSource(nextSource);
      setAssetUrls(Object.assign({}, ...nextPages.map((page) => page.assetUrls || {})));
    } else {
      const review = nextReviews.find((item: Review) => item.id === queryReviewId) || (fallbackToFirst ? nextReviews[0] : null);
      if (review) {
        setSelectedReviewId(review.id);
        setSource({ hospitalName: review.hospital_name || "", doctorName: review.reviewer_name || "", date: review.delivered_at || "", reviewText: review.review_text || "" });
      }
    }
  }, [activeContentId]);

  useEffect(() => {
    setBusy("load");
    void load().catch((loadError) => notify(loadError instanceof Error ? loadError.message : "리뷰 정보를 불러오지 못했습니다.", true)).finally(() => setBusy(""));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const replaceActiveDocument = useCallback((documentValue: ReviewStoryDocument, historyBase?: ReviewStoryDocument) => {
    if (!activePage) return;
    setPages((current) => current.map((page) => page.id === activePage.id ? { ...page, document: documentValue } : page));
    if (historyBase) {
      setHistory((current) => [...current.slice(-49), clone(historyBase)]);
      setFuture([]);
    }
  }, [activePage]);

  const patchElement = useCallback((id: string, patch: Partial<ReviewStoryElement>) => {
    if (!activePage) return;
    const before = clone(activePage.document);
    const next = clone(activePage.document);
    next.elements = next.elements.map((element) => element.id === id ? ({ ...element, ...patch } as ReviewStoryElement) : element);
    replaceActiveDocument(next, before);
  }, [activePage, replaceActiveDocument]);

  // 캔버스 자체(요소 아님) 속성 — 지금은 배경색 하나뿐. 빈 캔버스 클릭 시 이미 onSelect(null)이
  // 불려서(ReviewStoryCanvas) selectedElement가 비므로, 그 분기에 배경색 컨트롤을 얹는다.
  const patchDocument = useCallback((patch: Partial<ReviewStoryDocument>) => {
    if (!activePage) return;
    const before = clone(activePage.document);
    const next = clone(activePage.document);
    Object.assign(next, patch);
    replaceActiveDocument(next, before);
  }, [activePage, replaceActiveDocument]);

  const changeCanvasRatio = useCallback((ratio: ReviewStoryCanvasRatio) => {
    if (!activePage) return;
    const before = clone(activePage.document);
    const next = resizeReviewStoryDocument(activePage.document, ratio);
    replaceActiveDocument(next, before);
    setSelectedElementId(null);
    const size = REVIEW_STORY_CANVAS_SIZES[ratio];
    notify(`${size.label} · ${size.width}×${size.height}로 변경했습니다.`);
  }, [activePage, notify, replaceActiveDocument]);

  const addTextLayer = useCallback(() => {
    if (!activePage) return;
    const before = clone(activePage.document);
    const next = clone(activePage.document);
    const id = crypto.randomUUID();
    next.elements.push({
      id, name: "새 텍스트", type: "text", x: 190, y: 560, width: 700, height: 180,
      rotation: 0, opacity: 1, zIndex: Math.max(0, ...next.elements.map((element) => element.zIndex)) + 1,
      text: "텍스트를 입력하세요", fontFamily: "var(--font-sans)", fontSize: 56, fontWeight: 700,
      color: "#173734", textAlign: "center", lineHeight: 1.4, letterSpacing: -1,
    });
    replaceActiveDocument(next, before);
    setSelectedElementId(id);
  }, [activePage, replaceActiveDocument]);

  const addImageLayer = useCallback(() => {
    if (!activePage) return;
    const before = clone(activePage.document);
    const next = clone(activePage.document);
    const id = crypto.randomUUID();
    next.elements.push({
      id, name: "새 이미지", type: "image", x: 190, y: 300, width: 700, height: 700,
      rotation: 0, opacity: 0.2, zIndex: Math.max(0, ...next.elements.map((element) => element.zIndex)) + 1,
      fit: "cover", cropX: 50, cropY: 50, scale: 1,
    });
    replaceActiveDocument(next, before);
    setSelectedElementId(id);
    photoInputRef.current?.click();
  }, [activePage, replaceActiveDocument]);

  const createPage = useCallback(async (input: {
    pageType: ReviewStoryPageType;
    pageName: string;
    document: ReviewStoryDocument;
    layoutAssetId?: string;
    designPreset?: string;
  }) => {
    if (!activeContentId) return notify("먼저 리뷰 페이지를 생성해 주세요.", true);
    setBusy("page");
    try {
      const result = await jsonRequest(`/api/review-contents/${activeContentId}/pages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageType: input.pageType, pageName: input.pageName, editorDocument: input.document,
          layoutAssetId: input.layoutAssetId, designPreset: input.designPreset,
        }),
      });
      const nextPage: StoryPage = { ...result.page, pageType: input.pageType, pageName: input.pageName, document: input.document };
      setPages((current) => [...current, nextPage]);
      setActivePageId(nextPage.id);
      setSelectedElementId(null);
      setHistory([]);
      setFuture([]);
      setStudioModal(null);
      notify(`${input.pageName}를 추가했습니다.`);
    } catch (pageError) {
      notify(pageError instanceof Error ? pageError.message : "페이지를 추가하지 못했습니다.", true);
    } finally { setBusy(""); }
  }, [activeContentId, notify]);

  const generateBackgrounds = useCallback(async () => {
    setBusy("ai-background");
    notify("AI가 텍스트 없는 배경 3가지를 만들고 있습니다.");
    try {
      const result = await jsonRequest("/api/review-content/background/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: aiStyle, tone: aiTone, textures: aiTextures, prompt: aiPrompt, count: 3 }),
      });
      setBackgroundAssets(result.assets || []);
      notify("AI 배경 3가지를 준비했습니다. 하나를 선택해 적용하세요.");
    } catch (backgroundError) {
      notify(backgroundError instanceof Error ? backgroundError.message : "AI 배경을 만들지 못했습니다.", true);
    } finally { setBusy(""); }
  }, [aiPrompt, aiStyle, aiTextures, aiTone, notify]);

  const applyBackgroundAsset = useCallback((asset: GeneratedBackgroundAsset) => {
    if (!activePage) return;
    setAssetUrls((current) => ({ ...current, [asset.storagePath]: asset.url }));
    patchDocument({
      backgroundImage: {
        assetId: asset.assetId, storagePath: asset.storagePath, src: asset.url, fit: "cover",
        positionX: 50, positionY: 50, scale: 1, opacity: 1, source: "ai",
        mimeType: asset.mimeType, width: asset.width, height: asset.height,
      },
    });
    setStudioModal(null);
    notify("AI 배경을 현재 페이지에 적용했습니다.");
  }, [activePage, notify, patchDocument]);

  const applyTemplate = useCallback((layout: LayoutAsset) => {
    if (!activePage) return;
    const before = clone(activePage.document);
    const templateDocument = createReviewStoryDocument({ ...source, photo: photos[0], photos }, layout.layout_config || {});
    const next = resizeReviewStoryDocument(templateDocument, reviewStoryCanvasRatio(activePage.document));
    replaceActiveDocument(next, before);
    setSelectedElementId(null);
    setStudioModal(null);
    notify(`${layout.name} 템플릿을 현재 페이지에 적용했습니다.`);
  }, [activePage, notify, photos, replaceActiveDocument, source]);

  const undo = useCallback(() => {
    if (!activePage || !history.length) return;
    const previous = history[history.length - 1];
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [clone(activePage.document), ...current].slice(0, 50));
    replaceActiveDocument(clone(previous));
  }, [activePage, history, replaceActiveDocument]);

  const redo = useCallback(() => {
    if (!activePage || !future.length) return;
    const next = future[0];
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current.slice(-49), clone(activePage.document)]);
    replaceActiveDocument(clone(next));
  }, [activePage, future, replaceActiveDocument]);

  const deleteSelectedElement = useCallback(() => {
    if (!activePage || !selectedElement || selectedElement.locked) return;
    const before = clone(activePage.document);
    const next = clone(activePage.document);
    next.elements = next.elements.filter((element) => element.id !== selectedElement.id);
    replaceActiveDocument(next, before);
    setSelectedElementId(null);
  }, [activePage, selectedElement, replaceActiveDocument]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,textarea,select,[contenteditable=true]")) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "d" && selectedElement && activePage) {
        event.preventDefault();
        const before = clone(activePage.document);
        const next = clone(activePage.document);
        const copy = duplicateStoryElement(selectedElement, crypto.randomUUID());
        next.elements.push(copy);
        replaceActiveDocument(next, before);
        setSelectedElementId(copy.id);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedElement) {
        event.preventDefault();
        deleteSelectedElement();
        return;
      }
      if (selectedElement && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && !selectedElement.locked) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        patchElement(selectedElement.id, {
          x: selectedElement.x + (event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0),
          y: selectedElement.y + (event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0),
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activePage, deleteSelectedElement, patchElement, redo, replaceActiveDocument, selectedElement, undo]);

  const selectReview = (reviewId: string) => {
    setSelectedReviewId(reviewId);
    const linkedContent = contents.find((item) => item.review_id === reviewId);
    const review = reviews.find((item) => item.id === reviewId);
    if (linkedContent) {
      const nextPages = pagesFromContent(linkedContent, layouts);
      setActiveContentId(linkedContent.id);
      setPages(nextPages);
      setActivePageId(nextPages[0]?.id || "");
      setSource(contentSource(linkedContent));
      setAssetUrls(Object.assign({}, ...nextPages.map((page) => page.assetUrls || {})));
    } else if (review) {
      setActiveContentId("");
      setPages([]);
      setActivePageId("");
      setSource({ hospitalName: review.hospital_name || "", doctorName: review.reviewer_name || "", date: review.delivered_at || "", reviewText: review.review_text || "" });
    } else {
      setActiveContentId("");
      setPages([]);
      setActivePageId("");
      setSource({ hospitalName: "", doctorName: "", date: "", reviewText: "" });
    }
    setHistory([]);
    setFuture([]);
  };

  const applyPhoto = (photo: PhotoAsset) => {
    if (!activePage) return;
    const image = selectedElement?.type === "image" ? selectedElement : activePage.document.elements.find((element) => element.type === "image");
    if (!image) return notify("현재 템플릿에는 사진 영역이 없습니다.", true);
    patchElement(image.id, { src: photo.src, storagePath: photo.storagePath, opacity: 1 } as Partial<ReviewStoryImageElement>);
    setAssetUrls((current) => ({ ...current, [photo.storagePath]: photo.src }));
    setSelectedElementId(image.id);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("photos");
    try {
      const uploaded: PhotoAsset[] = [];
      for (const file of Array.from(files).slice(0, 12)) {
        const session = await jsonRequest("/api/review-assets/upload-session", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size }),
        });
        const { error: uploadError } = await getSupabase().storage.from(session.bucket)
          .uploadToSignedUrl(session.storagePath, session.token, file, { contentType: file.type, upsert: true });
        if (uploadError) throw uploadError;
        uploaded.push({ id: crypto.randomUUID(), name: file.name, src: URL.createObjectURL(file), storagePath: session.storagePath });
      }
      setPhotos((current) => [...current, ...uploaded]);
      setAssetUrls((current) => ({ ...current, ...Object.fromEntries(uploaded.map((photo) => [photo.storagePath, photo.src])) }));
      if (uploaded[0] && activePage) applyPhoto(uploaded[0]);
      notify(`${uploaded.length}장의 사진을 추가했습니다.`);
    } catch (uploadError) {
      notify(uploadError instanceof Error ? uploadError.message : "사진 업로드에 실패했습니다.", true);
    } finally {
      setBusy("");
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const ensureReview = async () => {
    if (!source.hospitalName.trim() || !source.reviewText.trim()) throw new Error("병원명과 후기 내용을 입력해 주세요.");
    const existing = reviews.find((review) => review.id === selectedReviewId);
    if (existing) {
      await jsonRequest(`/api/reviews/${existing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewText: source.reviewText, reviewerName: source.doctorName, deliveredAt: source.date }),
      });
      return { ...existing, review_text: source.reviewText, reviewer_name: source.doctorName, delivered_at: source.date };
    }
    const result = await jsonRequest("/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hospitalName: source.hospitalName, reviewerName: source.doctorName, deliveredAt: source.date || null, reviewText: source.reviewText, permissionToPublish: true }),
    });
    setSelectedReviewId(result.review.id);
    return result.review as Review;
  };

  const generateStories = async () => {
    if (busy) return;
    setBusy("generate");
    notify("후기를 분석하고 스토리를 구성하고 있습니다.");
    try {
      const review = await ensureReview();
      let contentId = contents.find((item) => item.review_id === review.id)?.id || "";
      if (!contentId) {
        const generated = await jsonRequest("/api/reviews/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hospitalName: source.hospitalName, reviews: [review], angle: "납품 후 고객 만족 후기" }),
        });
        contentId = generated.contentId;
      }
      if (!contentId) throw new Error("고객과 연결된 리뷰 콘텐츠를 생성하지 못했습니다.");
      const result = await jsonRequest(`/api/review-contents/${contentId}/generate-variants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layoutAssetIds: selectedTemplateIds, count: generationCount }),
      });
      if (photos.length) {
        await Promise.all(result.variants.map((variant: Variant, index: number) => {
          const layout = layouts.find((item) => item.id === variant.layout_asset_id);
          const photo = photos[index % photos.length];
          // 3컷/2컷 템플릿(photo2/photo3 바인딩)도 자동 채워지도록, 현재 사진 목록을 index부터
          // 순환시켜 최대 3장을 같이 넘긴다. 사진이 1장뿐이면 photos[1]/[2]는 같은 사진이 반복되고,
          // 템플릿에 그런 슬롯이 없으면 bindReviewStoryDocument가 그냥 무시한다.
          const photoWindow = photos.length ? Array.from({ length: Math.min(3, photos.length) }, (_, offset) => photos[(index + offset) % photos.length]) : [];
          const documentValue = createReviewStoryDocument({ ...source, photo, photos: photoWindow }, layout?.layout_config || {});
          return jsonRequest(`/api/review-contents/${contentId}/variants/${variant.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ editorDocument: documentValue }),
          });
        }));
      }
      await load(contentId);
      void createMailingDraft({
        type: "review_form",
        source_module: "review-studio",
        hospital_name: source.hospitalName,
        subject: `[포토클리닉] ${source.hospitalName} 리뷰 콘텐츠 초안`,
        body: `${source.hospitalName} 리뷰 스토리 ${generationCount}장 초안이 생성되었습니다.`,
      }).catch(() => undefined);
      notify(`${generationCount}장의 스토리를 생성했습니다. 각 장을 선택해 편집하세요.`);
    } catch (generateError) {
      notify(generateError instanceof Error ? generateError.message : "스토리 생성에 실패했습니다.", true);
    } finally {
      setBusy("");
    }
  };

  // Editor와 Export가 함께 쓰는 ReviewCanvasRenderer의 canonical DOM을 캡처한다. Export Host는
  // 화면 zoom을 받지 않으므로 선택한 캔버스 좌표·줄바꿈·crop이 그대로 유지되고, 고화질 출력은
  // raster scale만 2배가 된다. page는 항상 activePage라 현재 편집 문서와 snapshot도 같다.
  const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 생성에 실패했습니다.")), "image/png"));

  const capturePage = async (page: StoryPage, targetWidthPx: number = page.document.width) => {
    const host = exportHostRefs.current.get(page.id);
    if (!host) throw new Error("내보내기 캔버스를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.");
    return host.captureRaster(targetWidthPx);
  };

  const uploadRenderedPage = async (page: StoryPage) => {
    const canvas = await capturePage(page);
    const blob = await canvasToBlob(canvas);
    const session = await jsonRequest("/api/review-assets/upload-session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId: page.id, fileName: `review-story-${Date.now()}.png`, mimeType: "image/png", fileSize: blob.size }),
    });
    const { error: uploadError } = await getSupabase().storage.from(session.bucket)
      .uploadToSignedUrl(session.storagePath, session.token, blob, { contentType: "image/png", upsert: true });
    if (uploadError) throw uploadError;
    await jsonRequest(`/api/review-contents/${activeContentId}/variants/${page.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorDocument: page.document, imageStoragePath: session.storagePath }),
    });
  };

  const save = async () => {
    if (!activeContent || !activePage) {
      notify("먼저 스토리를 생성해 주세요.", true);
      return false;
    }
    setBusy("save");
    notify("편집 내용과 PNG 미리보기를 저장하고 있습니다.");
    try {
      await ensureReview();
      await Promise.all(pages.map((page) => jsonRequest(`/api/review-contents/${activeContent.id}/variants/${page.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorDocument: page.document, sortOrder: page.sort_order }),
      })));
      await uploadRenderedPage(activePage);
      await jsonRequest(`/api/review-contents/${activeContent.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: source.reviewText, caption: activeContent.caption, hashtags: activeContent.hashtags }),
      });
      await load(activeContent.id);
      notify("편집 내용과 PNG 미리보기를 저장했습니다.");
      return true;
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "저장에 실패했습니다.", true);
      return false;
    } finally { setBusy(""); }
  };

  const exportPng = async (outputScale = 1) => {
    if (!activePage) return notify("내보낼 스토리가 없습니다.", true);
    setBusy("export");
    setPngMenuOpen(false);
    try {
      const canvas = await capturePage(activePage, activePage.document.width * outputScale);
      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${source.hospitalName || "review"}-story-${pages.findIndex((page) => page.id === activePage.id) + 1}${outputScale === 2 ? "-2x" : ""}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify(`${canvas.width}×${canvas.height} PNG를 내보냈습니다.`);
    } catch (exportError) {
      notify(exportError instanceof Error ? exportError.message : "PNG 내보내기에 실패했습니다.", true);
    } finally { setBusy(""); }
  };

  const exportPdf = async () => {
    if (!activePage || !pages.length) return notify("내보낼 스토리가 없습니다.", true);
    setBusy("export");
    try {
      const { jsPDF } = await import("jspdf");
      const firstPage = pages[0];
      const { width, height } = firstPage.document;
      const pdf = new jsPDF({
        orientation: width >= height ? "landscape" : "portrait",
        unit: "px",
        format: [width, height],
        hotfixes: ["px_scaling"],
      });
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const canvas = await capturePage(page, page.document.width);
        if (index > 0) pdf.addPage([page.document.width, page.document.height], page.document.width >= page.document.height ? "landscape" : "portrait");
        pdf.addImage(canvas.toDataURL("image/png", 1.0), "PNG", 0, 0, page.document.width, page.document.height, undefined, "FAST");
      }
      pdf.save(`${source.hospitalName || "review"}-review-content.pdf`);
      notify(`${pages.length}페이지 PDF를 내보냈습니다.`);
    } catch (exportError) {
      notify(exportError instanceof Error ? exportError.message : "PDF 내보내기에 실패했습니다.", true);
    } finally { setBusy(""); }
  };

  const saveTemplate = async () => {
    if (!activePage) return notify("저장할 디자인이 없습니다.", true);
    const name = window.prompt("새 템플릿 이름", `${source.hospitalName || "리뷰"} 템플릿`);
    if (!name?.trim()) return;
    setBusy("template");
    try {
      await jsonRequest("/api/review-layout-assets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: "리뷰 스토리 편집기에서 저장", ratio: reviewStoryCanvasRatio(activePage.document), assetType: "builtin", layoutConfig: { template: "text_only", background: activePage.document.background, editorDocument: toReviewStoryTemplateDocument(activePage.document) } }),
      });
      await load(activeContentId);
      notify("현재 레이아웃을 기존 템플릿 보관함에 저장했습니다.");
    } catch (templateError) {
      notify(templateError instanceof Error ? templateError.message : "템플릿 저장에 실패했습니다.", true);
    } finally { setBusy(""); }
  };

  const approve = async () => {
    if (!activeContent || !activePage) return;
    setBusy("approve");
    try {
      const saved = await save();
      if (!saved) return;
      await jsonRequest(`/api/review-contents/${activeContent.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId: activePage.id }) });
      await load(activeContent.id);
      notify("현재 스토리를 대표 시안으로 승인했습니다.");
    } catch (approveError) { notify(approveError instanceof Error ? approveError.message : "승인에 실패했습니다.", true); }
    finally { setBusy(""); }
  };

  const publish = async () => {
    if (!activeContent || !window.confirm("승인된 스토리를 포토클리닉 Instagram에 게시할까요?")) return;
    setBusy("publish");
    try {
      await jsonRequest("/api/instagram/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentId: activeContent.id }) });
      await load(activeContent.id);
      notify("Instagram 게시를 완료했습니다.");
    } catch (publishError) { notify(publishError instanceof Error ? publishError.message : "게시하지 못했습니다.", true); }
    finally { setBusy(""); }
  };

  const removePage = async () => {
    if (!activeContent || !activePage || pages.length <= 1) return notify("마지막 스토리는 삭제할 수 없습니다.", true);
    if (!window.confirm("현재 스토리 페이지를 삭제할까요?")) return;
    try {
      await jsonRequest(`/api/review-contents/${activeContent.id}/variants/${activePage.id}`, { method: "DELETE" });
      const next = pages.filter((page) => page.id !== activePage.id);
      setPages(next);
      setActivePageId(next[0]?.id || "");
      notify("스토리 페이지를 삭제했습니다.");
    } catch (deleteError) { notify(deleteError instanceof Error ? deleteError.message : "삭제하지 못했습니다.", true); }
  };

  const reorderPage = async (direction: -1 | 1) => {
    if (!activeContent || !activePage) return;
    const index = pages.findIndex((page) => page.id === activePage.id);
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    setPages(next.map((page, sort_order) => ({ ...page, sort_order })));
    await Promise.all(next.map((page, sortOrder) => jsonRequest(`/api/review-contents/${activeContent.id}/variants/${page.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder }) })));
  };

  const movePageTo = async (sourceId: string, targetId: string) => {
    if (!activeContent || sourceId === targetId) return;
    const sourceIndex = pages.findIndex((page) => page.id === sourceId);
    const targetIndex = pages.findIndex((page) => page.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...pages];
    const [moving] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moving);
    const ordered = next.map((page, sort_order) => ({ ...page, sort_order }));
    setPages(ordered);
    await Promise.all(ordered.map((page) => jsonRequest(`/api/review-contents/${activeContent.id}/variants/${page.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: page.sort_order }) })));
  };

  const moveLayer = (direction: -1 | 1) => {
    if (!activePage || !selectedElement) return;
    patchElement(selectedElement.id, { zIndex: Math.max(0, selectedElement.zIndex + direction) });
  };

  // 리뷰 관리 목록 → [콘텐츠 만들기]로 들어올 때 콘텐츠를 새로 만드는 await가 끼어 있어서,
  // 그 사이 빈 에디터가 잠깐 보이지 않도록 첫 로드가 끝날 때까지는 로딩 문구만 보여준다.
  if (busy === "load" && !reviews.length && !contents.length) {
    return <main ref={workspaceRef} className={styles.workspace} style={workspaceHeight ? { height: workspaceHeight } : undefined}><div className={styles.loadingState}>리뷰 정보를 불러오는 중…</div></main>;
  }

  return (
    <main ref={workspaceRef} className={styles.workspace} style={workspaceHeight ? { height: workspaceHeight } : undefined}>
      <header className={styles.header}>
        <div>
          <nav className={styles.breadcrumb} aria-label="이동 경로">
            <Link href="/clients/reviews">리뷰 콘텐츠</Link>
            <span className={styles.breadcrumbSep}>/</span>
            <span>{source.hospitalName || "새 리뷰"}</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span className={styles.breadcrumbCurrent}>콘텐츠 만들기</span>
          </nav>
          {!isDesktopWindow && (
            <>
              <h1 className={styles.title}>리뷰 콘텐츠 만들기</h1>
              <p className={styles.subtitle}>하나의 캔버스에서 편집하고, 같은 디자인으로 PNG와 PDF를 내보냅니다.</p>
            </>
          )}
        </div>
        <div className={styles.headerActions}>
          {activeContent?.status === "approved" ? <button className={`${styles.button} ${styles.primaryOrange}`} onClick={() => void publish()} disabled={Boolean(busy)}><Send size={14} /><span>Instagram 게시</span></button> : null}
          {activeContent && !["approved", "published"].includes(activeContent.status) ? <button className={styles.button} onClick={() => void approve()} disabled={Boolean(busy)}><Check size={14} /><span>대표 승인</span></button> : null}
          <button className={styles.button} onClick={() => void save()} disabled={Boolean(busy) || !activePage}><Save size={14} /><span>저장</span></button>
          <button className={styles.button} onClick={() => void saveTemplate()} disabled={Boolean(busy) || !activePage}><Sparkles size={14} /><span>템플릿으로 저장</span></button>
          <button className={styles.button} onClick={() => void exportPdf()} disabled={Boolean(busy) || !activePage}><Download size={14} /><span>PDF 내보내기</span></button>
          <div className={styles.exportMenu}>
            <button className={styles.button} onClick={() => setPngMenuOpen((open) => !open)} disabled={Boolean(busy) || !activePage} aria-haspopup="menu" aria-expanded={pngMenuOpen}><Download size={14} /><span>PNG 내보내기</span><ChevronDown size={12} /></button>
            {pngMenuOpen ? (
              <div className={styles.exportMenuPopover} role="menu">
                <button type="button" role="menuitem" onClick={() => void exportPng(1)}><strong>기본 PNG</strong><span>{activePage.document.width} × {activePage.document.height}</span></button>
                <button type="button" role="menuitem" onClick={() => void exportPng(2)}><strong>고화질 PNG</strong><span>{activePage.document.width * 2} × {activePage.document.height * 2}</span></button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {message ? <div className={`${styles.status} ${error ? styles.error : ""}`} role="status">{message}</div> : null}

      <div className={styles.editorGrid}>
        <aside className={styles.panel} aria-label="리뷰 입력과 소스">
          <section className={styles.section}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>선택한 리뷰</h2></div>
            <select className={`${styles.select} ${styles.reviewPicker}`} value={selectedReviewId} onChange={(event) => selectReview(event.target.value)}>
              <option value="">새 리뷰 작성</option>
              {reviews.map((review) => <option key={review.id} value={review.id}>{review.hospital_name} · {review.review_text.slice(0, 24)}</option>)}
            </select>
            <div className={styles.quoteCard}>
              <Quote size={16} className={styles.quoteIcon} />
              <textarea className={styles.quoteTextarea} value={source.reviewText} onChange={(event) => setSource((current) => ({ ...current, reviewText: event.target.value }))} placeholder="고객이 남긴 후기를 입력해 주세요." />
              <div className={styles.quoteMeta}>
                {selectedReview?.rating ? (
                  <span className={styles.quoteStars}>
                    {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={12} fill={index < Math.round(selectedReview.rating || 0) ? "#EB8F22" : "none"} color="#EB8F22" />)}
                    <span>{selectedReview.rating.toFixed(1)}</span>
                  </span>
                ) : <span />}
                <span className={styles.quoteDate}>{formatShortDate(source.date)}</span>
              </div>
            </div>
            <div className={styles.sourceActions}><span className={styles.count}>{source.reviewText.length.toLocaleString()}자</span><button type="button" className={styles.subtleButton} onClick={() => void generateStories()} disabled={Boolean(busy)}>문구 정리하기 ✨</button></div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>병원 / 의사 정보</h2>
            <div className={styles.hospitalCard}>
              <span className={styles.hospitalLogo}><Building2 size={16} /></span>
              <div className={styles.hospitalFields}>
                <input className={styles.hospitalInput} value={source.hospitalName} onChange={(event) => setSource((current) => ({ ...current, hospitalName: event.target.value }))} placeholder="춘천 가두리한의원" />
                <input className={styles.hospitalInputSm} value={source.doctorName} onChange={(event) => setSource((current) => ({ ...current, doctorName: event.target.value }))} placeholder="김윤일 원장님" />
              </div>
            </div>
            <label className={styles.field}>촬영일 또는 리뷰일<input className={styles.input} type="date" value={source.date || ""} onChange={(event) => setSource((current) => ({ ...current, date: event.target.value }))} /></label>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>선택된 사진 ({photos.length})</h2><button type="button" className={styles.subtleButton} onClick={() => photoInputRef.current?.click()}><Upload size={12} /> 사진 추가</button></div>
            <div className={styles.photoGrid}>
              {photos.map((photo) => <button type="button" key={photo.id} draggable className={styles.photoThumb} title={`${photo.name} · 드래그해서 순서 변경`} onDragStart={(event) => event.dataTransfer.setData("text/review-photo", photo.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData("text/review-photo"); setPhotos((current) => { const from = current.findIndex((item) => item.id === sourceId); const to = current.findIndex((item) => item.id === photo.id); if (from < 0 || to < 0) return current; const next = [...current]; const [moving] = next.splice(from, 1); next.splice(to, 0, moving); return next; }); }} onClick={() => applyPhoto(photo)}><img src={photo.src} alt={photo.name} /><span className={styles.photoDelete} onClick={(event) => { event.stopPropagation(); setPhotos((current) => current.filter((item) => item.id !== photo.id)); }}>×</span></button>)}
              <button type="button" className={styles.photoAdd} onClick={() => photoInputRef.current?.click()} aria-label="사진 추가"><ImagePlus size={20} /></button>
            </div>
            <input ref={photoInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void uploadPhotos(event.target.files)} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>캔버스 비율</h2>
              <span className={styles.count}>{activePage ? `${activePage.document.width}×${activePage.document.height}` : "페이지 생성 후 선택"}</span>
            </div>
            <label className={styles.canvasRatioField}>
              <span>팔레트 크기</span>
              <select
                className={styles.select}
                value={activePage ? reviewStoryCanvasRatio(activePage.document) : "4:5"}
                aria-label="팔레트 비율"
                disabled={!activePage}
                onChange={(event) => changeCanvasRatio(event.target.value as ReviewStoryCanvasRatio)}
              >
                {CANVAS_RATIO_OPTIONS.map(([ratio, size]) => <option key={ratio} value={ratio}>{size.label} · {size.width}×{size.height}</option>)}
              </select>
            </label>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>템플릿 선택</h2><span className={styles.count}>{selectedTemplateIds.length}개 선택</span></div>
            <div className={styles.templateGrid}>
              {layouts.map((layout) => {
                const selected = selectedTemplateIds.includes(layout.id);
                return (
                  <button
                    key={layout.id} type="button" aria-pressed={selected}
                    className={`${styles.templateCard} ${selected ? styles.templateCardSelected : ""}`}
                    onClick={() => {
                      setSelectedTemplateIds((current) => current.includes(layout.id) ? current.filter((id) => id !== layout.id) : [...current, layout.id].slice(-6));
                      // 성공 기준: 템플릿을 클릭하면 (열려 있는 페이지가 있을 때) 캔버스가 즉시
                      // 그 레이아웃으로 바뀐다 — 현재 후기/병원/사진 데이터를 그대로 새 geometry에 다시 바인딩.
                      if (activePage) {
                        const before = clone(activePage.document);
                        const templateDocument = createReviewStoryDocument({ ...source, photo: photos[0], photos: photos.slice(0, 3) }, layout.layout_config || {});
                        const next = resizeReviewStoryDocument(templateDocument, reviewStoryCanvasRatio(activePage.document));
                        replaceActiveDocument(next, before);
                        setSelectedElementId(null);
                      }
                    }}
                  >
                    <span className={styles.templateThumb}>
                      {layout.thumbnailUrl ? (
                        <img src={layout.thumbnailUrl} alt={layout.name} />
                      ) : (
                        <ReviewTemplateThumbnail document={templatePreviews.get(layout.id)!} />
                      )}
                      {selected ? <span className={styles.templateCheck}><Check size={11} /></span> : null}
                    </span>
                    <span className={styles.templateLabel}>{layout.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className={styles.generateBox}>
            <h2 className={styles.sectionTitle}>스토리 자동 생성</h2>
            <p className={styles.helper}>후기 문구와 선택한 템플릿을 순환해 여러 장을 만듭니다.</p>
            <div className={styles.stepper}><button className={styles.iconButton} onClick={() => setGenerationCount((value) => Math.max(1, value - 1))}><Minus size={13} /></button><span className={styles.stepperValue}>{generationCount}장</span><button className={styles.iconButton} onClick={() => setGenerationCount((value) => Math.min(10, value + 1))}><Plus size={13} /></button></div>
            <button className={`${styles.button} ${styles.primary}`} style={{ width: "100%" }} onClick={() => void generateStories()} disabled={Boolean(busy) || !selectedTemplateIds.length}><Sparkles size={14} />{busy === "generate" ? "스토리 구성 중…" : "+ 스토리 자동 생성"}</button>
          </div>
        </aside>

        <section className={styles.center} aria-label="리뷰 콘텐츠 편집기">
          <div className={styles.toolbar}>
            <div className={styles.contextTools}>
              <div className={styles.toolbarGroup}>
                <button className={styles.iconButton} onClick={undo} disabled={!history.length} aria-label="실행 취소"><Undo2 size={15} /></button>
                <button className={styles.iconButton} onClick={redo} disabled={!future.length} aria-label="다시 실행"><Redo2 size={15} /></button>
              </div>
              {selectedElement?.type === "text" ? (
                <>
                  <span className={styles.contextLabel}><Type size={14} /> 텍스트</span>
                  <select className={styles.toolbarSelect} value={selectedElement.fontFamily} aria-label="글꼴" onChange={(event) => patchElement(selectedElement.id, { fontFamily: event.target.value } as Partial<ReviewStoryElement>)}>{FONT_OPTIONS.map((font) => <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>)}</select>
                  <ToolbarRange label="크기" value={selectedElement.fontSize} min={8} max={120} step={1} onChange={(value) => patchElement(selectedElement.id, { fontSize: value } as Partial<ReviewStoryElement>)} />
                  <label className={styles.colorTool} title="글자 색상"><Palette size={14} /><input type="color" value={selectedElement.color} onChange={(event) => patchElement(selectedElement.id, { color: event.target.value } as Partial<ReviewStoryElement>)} /></label>
                  <button className={`${styles.toolButton} ${selectedElement.fontWeight >= 700 ? styles.toolActive : ""}`} onClick={() => patchElement(selectedElement.id, { fontWeight: selectedElement.fontWeight >= 700 ? 400 : 700 } as Partial<ReviewStoryElement>)} aria-label="굵게"><Bold size={14} /></button>
                  <button className={`${styles.toolButton} ${selectedElement.italic ? styles.toolActive : ""}`} onClick={() => patchElement(selectedElement.id, { italic: !selectedElement.italic } as Partial<ReviewStoryElement>)} aria-label="기울임"><Italic size={14} /></button>
                  <button className={`${styles.toolButton} ${selectedElement.underline ? styles.toolActive : ""}`} onClick={() => patchElement(selectedElement.id, { underline: !selectedElement.underline } as Partial<ReviewStoryElement>)} aria-label="밑줄"><Underline size={14} /></button>
                  {([{"value":"left","icon":AlignLeft},{"value":"center","icon":AlignCenter},{"value":"right","icon":AlignRight}] as const).map(({ value, icon: Icon }) => <button key={value} className={`${styles.toolButton} ${styles.alignmentButton} ${selectedElement.textAlign === value ? styles.toolActive : ""}`} onClick={() => patchElement(selectedElement.id, { textAlign: value } as Partial<ReviewStoryElement>)} aria-label={`${value} 정렬`}><Icon size={14} /></button>)}
                  <button
                    className={`${styles.toolButton} ${styles.compactAlignButton} ${styles.toolActive}`}
                    onClick={() => patchElement(selectedElement.id, { textAlign: selectedElement.textAlign === "left" ? "center" : selectedElement.textAlign === "center" ? "right" : "left" } as Partial<ReviewStoryElement>)}
                    aria-label={`정렬 변경 · 현재 ${selectedElement.textAlign === "left" ? "왼쪽" : selectedElement.textAlign === "center" ? "가운데" : "오른쪽"}`}
                    title="정렬 변경"
                  >
                    {selectedElement.textAlign === "left" ? <AlignLeft size={14} /> : selectedElement.textAlign === "center" ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                  </button>
                  <ToolbarRange label="행간" value={selectedElement.lineHeight} min={0.8} max={2.2} step={0.02} format={(value) => value.toFixed(2)} onChange={(value) => patchElement(selectedElement.id, { lineHeight: value } as Partial<ReviewStoryElement>)} />
                  <ToolbarRange label="자간" value={selectedElement.letterSpacing} min={-5} max={12} step={0.1} format={(value) => `${value.toFixed(1)}`} onChange={(value) => patchElement(selectedElement.id, { letterSpacing: value } as Partial<ReviewStoryElement>)} />
                  <label className={`${styles.wrapToggle} ${selectedElement.autoWrap !== false ? styles.wrapToggleActive : ""}`} title="한글 단어와 문장부호를 고려해 자동으로 줄바꿈합니다." aria-label="자동 줄바꿈">
                    <input type="checkbox" checked={selectedElement.autoWrap !== false} onChange={(event) => patchElement(selectedElement.id, { autoWrap: event.target.checked } as Partial<ReviewStoryElement>)} />
                    <span className={styles.wrapToggleLabel}>자동 줄바꿈</span>
                  </label>
                  <button className={`${styles.toolButton} ${selectedElement.highlight ? styles.toolActive : ""}`} onClick={() => patchElement(selectedElement.id, { highlight: !selectedElement.highlight } as Partial<ReviewStoryElement>)} aria-label="형광펜"><Highlighter size={14} /></button>
                  <button className={styles.toolButton} onClick={deleteSelectedElement} disabled={selectedElement.locked} aria-label="삭제"><Trash2 size={14} /></button>
                </>
              ) : selectedElement?.type === "image" ? (
                <>
                  <span className={styles.contextLabel}><ImagePlus size={14} /> 이미지</span>
                  <button className={styles.toolTextButton} onClick={() => photoInputRef.current?.click()}><ImagePlus size={14} /> 교체</button>
                  <button className={styles.toolTextButton} onClick={() => canvasHandleRef.current?.startImageCrop(selectedElement.id)}><Crop size={14} /> 자르기</button>
                  <div className={styles.fitToggle}><button className={(selectedElement.fit || "cover") === "cover" ? styles.toolActive : ""} onClick={() => patchElement(selectedElement.id, { fit: "cover", scale: Math.max(1, selectedElement.scale) } as Partial<ReviewStoryElement>)}>채우기</button><button className={selectedElement.fit === "contain" ? styles.toolActive : ""} onClick={() => patchElement(selectedElement.id, { fit: "contain", scale: 1 } as Partial<ReviewStoryElement>)}>맞추기</button></div>
                  <button className={styles.toolTextButton} onClick={() => patchElement(selectedElement.id, { cropX: 50, cropY: 50, scale: 1 } as Partial<ReviewStoryElement>)}>위치 초기화</button>
                  <button className={styles.toolButton} onClick={deleteSelectedElement} disabled={selectedElement.locked} aria-label="삭제"><Trash2 size={14} /></button>
                </>
              ) : selectedElement?.type === "shape" ? (
                <>
                  <span className={styles.contextLabel}><SlidersHorizontal size={14} /> 장식</span>
                  <label className={styles.colorTool} title="장식 색상"><Palette size={14} /><input type="color" value={selectedElement.fill} onChange={(event) => patchElement(selectedElement.id, { fill: event.target.value } as Partial<ReviewStoryElement>)} /></label>
                  <button className={styles.toolButton} onClick={deleteSelectedElement} disabled={selectedElement.locked} aria-label="삭제"><Trash2 size={14} /></button>
                </>
              ) : (
                <>
                  <button className={styles.toolTextButton} onClick={addTextLayer}><Type size={14} /> 텍스트</button>
                  <button className={styles.toolTextButton} onClick={addImageLayer}><ImagePlus size={14} /> 이미지</button>
                  <label className={styles.colorToolWide}><Palette size={14} /> 배경<input type="color" value={activePage?.document.background || "#ffffff"} onChange={(event) => patchDocument({ background: event.target.value })} /></label>
                  <button className={styles.aiToolButton} onClick={() => setStudioModal("ai")} disabled={!activePage}><WandSparkles size={14} /> AI 배경</button>
                  <button className={styles.toolTextButton} onClick={() => setStudioModal("template")} disabled={!activePage}><LayoutTemplate size={14} /> 템플릿</button>
                </>
              )}
            </div>
          </div>
          {activePage ? <ReviewStoryCanvas ref={canvasHandleRef} document={activePage.document} selectedElementId={selectedElementId} assetUrls={{ ...assetUrls, ...(activePage.assetUrls || {}) }} zoom={zoom} lockAspectRatio={lockAspectRatio} onSelect={setSelectedElementId} onChange={replaceActiveDocument} onReplaceImage={() => photoInputRef.current?.click()} /> : <div className={styles.propertyEmpty} style={{ alignSelf: "center", justifySelf: "center" }}><Sparkles size={28} /><br />왼쪽에서 후기를 확인하고<br />템플릿을 선택해 주세요.</div>}
          {activePage ? <div className={styles.canvasZoom}><button onClick={() => setZoom((value) => Math.max(50, value - 10))} aria-label="축소"><ZoomOut size={13} /></button><span>{zoom}%</span><button onClick={() => setZoom((value) => Math.min(160, value + 10))} aria-label="확대"><ZoomIn size={13} /></button><button onClick={() => setZoom(100)}>맞춤</button></div> : null}

          <section className={styles.storyStrip} aria-label="콘텐츠 페이지">
            <div className={styles.storyStripHeader}><h2 className={styles.sectionTitle}>페이지 ({activePage ? pages.findIndex((page) => page.id === activePage.id) + 1 : 0}/{pages.length})</h2><div className={styles.toolbarGroup}><button className={styles.iconButton} onClick={() => void reorderPage(-1)} disabled={!activePage} aria-label="앞으로 이동"><ArrowUp size={13} /></button><button className={styles.iconButton} onClick={() => void reorderPage(1)} disabled={!activePage} aria-label="뒤로 이동"><ArrowDown size={13} /></button><button className={styles.iconButton} onClick={() => void removePage()} disabled={!activePage || pages.length <= 1} aria-label="페이지 삭제"><Trash2 size={13} /></button></div></div>
            <div className={styles.storyList}>
              {pages.map((page, index) => <button key={page.id} type="button" draggable className={`${styles.storyThumb} ${activePage?.id === page.id ? styles.storyThumbActive : ""}`} title="드래그해서 페이지 순서 변경" onDragStart={(event) => event.dataTransfer.setData("text/review-page", page.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void movePageTo(event.dataTransfer.getData("text/review-page"), page.id); }} onClick={() => { setActivePageId(page.id); setSelectedElementId(null); setHistory([]); setFuture([]); }}><ReviewCanvasThumbnail className={styles.storyPreview} document={page.document} assetUrls={{ ...assetUrls, ...(page.assetUrls || {}) }} /><span className={styles.storyNumber}>{String(index + 1).padStart(2, "0")} · {page.pageName}{page.is_selected ? " · 대표" : ""}</span></button>)}
              <button type="button" className={styles.pageAction} onClick={() => setStudioModal("cover")} disabled={!activeContent}><Plus size={17} /><strong>커버 추가</strong><span>첫 페이지용</span></button>
              <button type="button" className={styles.pageAction} onClick={() => setStudioModal("page")} disabled={!activeContent}><Plus size={17} /><strong>페이지 추가</strong><span>빈 페이지/템플릿</span></button>
              <button type="button" className={styles.pageAction} onClick={() => setStudioModal("design")} disabled={!activeContent}><Layers3 size={17} /><strong>디자인 추가</strong><span>CTA·브랜드</span></button>
            </div>
          </section>
        </section>

        <aside className={`${styles.panel} ${styles.rightPanel}`} aria-label="요소 속성과 레이어">
          <div className={styles.rightTabs} role="tablist">
            <button type="button" role="tab" aria-selected={rightTab === "props"} className={rightTab === "props" ? styles.rightTabActive : ""} onClick={() => setRightTab("props")}><SlidersHorizontal size={14} /> 요소 설정</button>
            <button type="button" role="tab" aria-selected={rightTab === "layers"} className={rightTab === "layers" ? styles.rightTabActive : ""} onClick={() => setRightTab("layers")}><Layers3 size={14} /> 레이어</button>
          </div>
          {rightTab === "props" ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>{selectedElement ? selectedElement.name : "페이지 배경"}</h2>{selectedElement ? <span className={styles.count}>정밀 설정</span> : null}</div>
              {!selectedElement ? (
                activePage ? <>
                  <label className={styles.field}>배경색<input className={styles.input} type="color" value={activePage.document.background} onChange={(event) => patchDocument({ background: event.target.value })} /></label>
                  <button className={`${styles.button} ${styles.aiPanelButton}`} onClick={() => setStudioModal("ai")}><WandSparkles size={14} /> AI 배경 생성</button>
                  {activePage.document.backgroundImage ? <>
                    <label className={styles.field}>배경 확대 {activePage.document.backgroundImage.scale.toFixed(2)}×<input className={styles.range} type="range" min="1" max="2.5" step="0.05" value={activePage.document.backgroundImage.scale} onChange={(event) => patchDocument({ backgroundImage: { ...activePage.document.backgroundImage!, scale: Number(event.target.value) } })} /></label>
                    <div className={styles.propertyGrid}><label className={styles.field}>가로 위치<input className={styles.range} type="range" min="0" max="100" value={activePage.document.backgroundImage.positionX} onChange={(event) => patchDocument({ backgroundImage: { ...activePage.document.backgroundImage!, positionX: Number(event.target.value) } })} /></label><label className={styles.field}>세로 위치<input className={styles.range} type="range" min="0" max="100" value={activePage.document.backgroundImage.positionY} onChange={(event) => patchDocument({ backgroundImage: { ...activePage.document.backgroundImage!, positionY: Number(event.target.value) } })} /></label></div>
                    <label className={styles.field}>불투명도 {Math.round(activePage.document.backgroundImage.opacity * 100)}%<input className={styles.range} type="range" min="0" max="100" value={Math.round(activePage.document.backgroundImage.opacity * 100)} onChange={(event) => patchDocument({ backgroundImage: { ...activePage.document.backgroundImage!, opacity: Number(event.target.value) / 100 } })} /></label>
                    <button className={styles.button} onClick={() => patchDocument({ backgroundImage: undefined })}><Trash2 size={13} /> 배경 이미지 제거</button>
                  </> : <p className={styles.propertyHint}>캔버스 요소를 선택하면 위치와 크기를 정밀하게 조절할 수 있습니다.</p>}
                </> : <div className={styles.propertyEmpty}>페이지를 먼저 만들어 주세요.</div>
              ) : <>
                <h3 className={styles.subheading}>위치 및 크기</h3>
                <div className={styles.propertyGrid}>{(["x", "y", "width", "height"] as const).map((key) => <label key={key} className={styles.field}>{key.toUpperCase()}<input className={styles.input} type="number" value={Math.round(selectedElement[key])} onChange={(event) => patchElement(selectedElement.id, { [key]: Number(event.target.value) })} /></label>)}</div>
                <label className={styles.checkboxField}><input type="checkbox" checked={lockAspectRatio} onChange={(event) => setLockAspectRatio(event.target.checked)} /> 비율 유지</label>
                <label className={styles.field}>회전 {selectedElement.rotation}°<input className={styles.range} type="range" min="-180" max="180" value={selectedElement.rotation} onChange={(event) => patchElement(selectedElement.id, { rotation: Number(event.target.value) })} /></label>
                <label className={styles.field}>불투명도 {Math.round(selectedElement.opacity * 100)}%<input className={styles.range} type="range" min="0" max="100" value={Math.round(selectedElement.opacity * 100)} onChange={(event) => patchElement(selectedElement.id, { opacity: Number(event.target.value) / 100 })} /></label>
                {selectedElement.type === "text" ? <label className={styles.field}>내용<textarea className={styles.textarea} value={selectedElement.text} onChange={(event) => patchElement(selectedElement.id, { text: event.target.value } as Partial<ReviewStoryElement>)} /></label> : null}
                {selectedElement.type === "image" ? <><ImagePropsFields element={selectedElement} patch={(value) => patchElement(selectedElement.id, value as Partial<ReviewStoryElement>)} onReplace={() => photoInputRef.current?.click()} /><ImageStyleFields element={selectedElement} patch={(value) => patchElement(selectedElement.id, value as Partial<ReviewStoryElement>)} /></> : null}
              </>}
            </section>
          ) : (
            <section className={styles.section}>
              <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>레이어</h2><span className={styles.count}>{activePage?.document.elements.length || 0}개</span></div>
              <div className={styles.layers}>{[...(activePage?.document.elements || [])].sort((a, b) => b.zIndex - a.zIndex).map((element) => <div key={element.id} className={`${styles.layer} ${selectedElementId === element.id ? styles.layerSelected : ""}`} onClick={() => setSelectedElementId(element.id)}><GripVertical size={12} className={styles.layerGrip} /><button className={styles.layerIcon} aria-label={element.hidden ? "레이어 표시" : "레이어 숨기기"} onClick={(event) => { event.stopPropagation(); patchElement(element.id, { hidden: !element.hidden }); }}>{element.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button><span>{element.name}</span><button className={styles.layerIcon} aria-label={element.locked ? "잠금 해제" : "잠금"} onClick={(event) => { event.stopPropagation(); patchElement(element.id, { locked: !element.locked }); }}>{element.locked ? <Lock size={12} /> : <Unlock size={12} />}</button><MoreHorizontal size={13} /></div>)}</div>
              <div className={styles.backgroundLayer} onClick={() => setSelectedElementId(null)}><Palette size={13} /><span>배경</span></div>
              <div className={styles.layerFooter}><button className={styles.iconButton} onClick={() => moveLayer(1)} disabled={!selectedElement}><ArrowUp size={13} /></button><button className={styles.iconButton} onClick={() => moveLayer(-1)} disabled={!selectedElement}><ArrowDown size={13} /></button><button className={styles.iconButton} onClick={deleteSelectedElement} disabled={!selectedElement || selectedElement.locked}><Trash2 size={13} /></button></div>
            </section>
          )}
        </aside>
      </div>

      {pages.map((page) => (
        <ReviewCanvasExportHost
          key={`export-${page.id}`}
          ref={(handle) => { if (handle) exportHostRefs.current.set(page.id, handle); else exportHostRefs.current.delete(page.id); }}
          document={page.document}
          assetUrls={{ ...assetUrls, ...(page.assetUrls || {}) }}
        />
      ))}

      <Modal open={studioModal === "cover"} onClose={() => setStudioModal(null)} title="커버 추가" width={720}>
        <p className={styles.modalIntro}>기존 리뷰 페이지는 그대로 두고 새 커버 페이지를 추가합니다. 병원 정보와 날짜만 재사용하며 후기 본문은 복사하지 않습니다.</p>
        <div className={styles.choiceGrid}>
          {COVER_PRESETS.map((preset) => <button key={preset.value} className={styles.choiceCard} disabled={Boolean(busy)} onClick={() => void createPage({ pageType: "cover", pageName: `${preset.label} 커버`, document: createReviewCoverDocument({ ...source, photo: photos[0], photos }, preset.value), designPreset: preset.value })}><span className={`${styles.choicePreview} ${styles[`cover_${preset.value}`]}`}><strong>Aa</strong></span><strong>{preset.label}</strong><small>{preset.description}</small></button>)}
        </div>
      </Modal>

      <Modal open={studioModal === "page"} onClose={() => setStudioModal(null)} title="페이지 추가" width={760}>
        <p className={styles.modalIntro}>빈 페이지에서 시작하거나 기존 템플릿에 현재 콘텐츠 정보를 넣어 새 페이지로 추가할 수 있습니다.</p>
        <div className={styles.choiceGrid}>
          <button className={styles.choiceCard} disabled={Boolean(busy)} onClick={() => void createPage({ pageType: "free", pageName: "빈 페이지", document: createBlankReviewStoryDocument() })}><span className={`${styles.choicePreview} ${styles.blankPreview}`}><Plus size={22} /></span><strong>빈 페이지</strong><small>텍스트와 이미지를 직접 추가</small></button>
          {layouts.slice(0, 5).map((layout) => <button key={layout.id} className={styles.choiceCard} disabled={Boolean(busy)} onClick={() => void createPage({ pageType: "review", pageName: layout.name, document: createReviewStoryDocument({ ...source, photo: photos[0], photos }, layout.layout_config || {}), layoutAssetId: layout.id })}><span className={styles.choicePreview}>{layout.thumbnailUrl ? <img src={layout.thumbnailUrl} alt="" /> : <ReviewTemplateThumbnail document={templatePreviews.get(layout.id)!} />}</span><strong>{layout.name}</strong><small>{layout.description || "리뷰 템플릿"}</small></button>)}
        </div>
      </Modal>

      <Modal open={studioModal === "template"} onClose={() => setStudioModal(null)} title="템플릿 변경" width={760}>
        <p className={styles.modalIntro}>현재 후기·병원·사진 데이터는 유지하면서 선택한 페이지의 레이아웃만 변경합니다.</p>
        <div className={styles.choiceGrid}>
          {layouts.map((layout) => <button key={layout.id} className={styles.choiceCard} onClick={() => applyTemplate(layout)}><span className={styles.choicePreview}>{layout.thumbnailUrl ? <img src={layout.thumbnailUrl} alt="" /> : <ReviewTemplateThumbnail document={templatePreviews.get(layout.id)!} />}</span><strong>{layout.name}</strong><small>{layout.description || "리뷰 템플릿"}</small></button>)}
        </div>
      </Modal>

      <Modal open={studioModal === "design"} onClose={() => setStudioModal(null)} title="디자인 추가" width={650}>
        <p className={styles.modalIntro}>후기 페이지와 별개로 CTA, 브랜드 문구, 스토리 카드 디자인을 추가합니다.</p>
        <div className={styles.choiceGrid}>
          {DESIGN_PRESETS.map((preset) => <button key={preset.value} className={styles.choiceCard} disabled={Boolean(busy)} onClick={() => void createPage({ pageType: "free", pageName: preset.label, document: createReviewDesignDocument(source, preset.value), designPreset: preset.value })}><span className={`${styles.choicePreview} ${styles[`design_${preset.value}`]}`}><strong>{preset.value === "cta" ? "→" : preset.value === "brand" ? "O" : "“"}</strong></span><strong>{preset.label}</strong><small>{preset.description}</small></button>)}
        </div>
      </Modal>

      <Modal open={studioModal === "ai"} onClose={() => setStudioModal(null)} title="AI 배경 생성" width={760}>
        <p className={styles.modalIntro}>텍스트는 이미지에 넣지 않고, 편집 가능한 레이어로 유지합니다. 생성 결과는 Olivia 스토리지에 저장된 뒤 캔버스에 적용됩니다.</p>
        <div className={styles.aiForm}>
          <fieldset><legend>스타일</legend><div className={styles.chipRow}>{AI_STYLE_OPTIONS.map(([value, label]) => <button type="button" key={value} className={aiStyle === value ? styles.chipActive : ""} onClick={() => setAiStyle(value)}>{label}</button>)}</div></fieldset>
          <fieldset><legend>컬러톤</legend><div className={styles.chipRow}>{AI_TONE_OPTIONS.map(([value, label]) => <button type="button" key={value} className={aiTone === value ? styles.chipActive : ""} onClick={() => setAiTone(value)}>{label}</button>)}</div></fieldset>
          <fieldset><legend>텍스처</legend><div className={styles.checkRow}>{AI_TEXTURE_OPTIONS.map(([value, label]) => <label key={value}><input type="checkbox" checked={aiTextures.includes(value)} onChange={(event) => setAiTextures((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value))} /> {label}</label>)}</div></fieldset>
          <label className={styles.field}>원하는 분위기<textarea className={styles.textarea} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} maxLength={500} /></label>
          <button className={`${styles.button} ${styles.primary} ${styles.generateBackgroundButton}`} onClick={() => void generateBackgrounds()} disabled={Boolean(busy)}><WandSparkles size={15} />{busy === "ai-background" ? "3개 생성 중…" : "3개 생성"}</button>
          {backgroundAssets.length ? <><h3 className={styles.resultTitle}>저장된 배경 / 생성 결과</h3><div className={styles.backgroundResults}>{backgroundAssets.map((asset, index) => <button type="button" key={asset.assetId} onClick={() => applyBackgroundAsset(asset)}><img src={asset.url} alt={`AI 배경 ${index + 1}`} /><span>{String(index + 1).padStart(2, "0")} · 적용</span></button>)}</div></> : null}
        </div>
      </Modal>
    </main>
  );
}

function ImagePropsFields({ element, patch, onReplace }: { element: ReviewStoryImageElement; patch: (value: Partial<ReviewStoryImageElement>) => void; onReplace: () => void }) {
  return <>
    <div className={styles.sourceActions}><button className={styles.button} onClick={onReplace}><ImagePlus size={13} /> 교체</button><button className={styles.button} onClick={() => patch({ cropX: 50, cropY: 50, scale: 1 })}>자르기 초기화</button></div>
    <label className={styles.field}>사진 확대 / 자르기<input className={styles.range} type="range" min="1" max="3" step="0.05" value={element.scale} onChange={(event) => patch({ scale: Number(event.target.value) })} /></label>
    <div className={styles.propertyGrid}><label className={styles.field}>가로 위치<input className={styles.range} type="range" min="0" max="100" value={element.cropX} onChange={(event) => patch({ cropX: Number(event.target.value) })} /></label><label className={styles.field}>세로 위치<input className={styles.range} type="range" min="0" max="100" value={element.cropY} onChange={(event) => patch({ cropY: Number(event.target.value) })} /></label></div>
  </>;
}

function ImageStyleFields({ element, patch }: { element: ReviewStoryImageElement; patch: (value: Partial<ReviewStoryImageElement>) => void }) {
  const blend = element.edgeBlend || { enabled: false, type: "gradient" as const, directions: ["bottom" as const], size: 180, strength: 80 };
  const directions = ["top", "bottom", "left", "right"] as const;
  return <>
    <label className={styles.checkboxField}>경계 블렌딩<input type="checkbox" checked={blend.enabled} onChange={(event) => patch({ edgeBlend: { ...blend, enabled: event.target.checked } })} /></label>
    {blend.enabled ? <>
      <div className={styles.segmented}><button className={`${styles.segment} ${blend.type === "gradient" ? styles.segmentActive : ""}`} onClick={() => patch({ edgeBlend: { ...blend, type: "gradient" } })}>그라데이션</button><button className={`${styles.segment} ${blend.type === "blur" ? styles.segmentActive : ""}`} onClick={() => patch({ edgeBlend: { ...blend, type: "blur" } })}>블러</button></div>
      <label className={styles.field}>방향<div className={styles.segmented} style={{ gridTemplateColumns: "repeat(4,1fr)" }}>{directions.map((direction) => <button key={direction} className={`${styles.segment} ${blend.directions.includes(direction) ? styles.segmentActive : ""}`} onClick={() => patch({ edgeBlend: { ...blend, directions: blend.directions.includes(direction) ? blend.directions.filter((item) => item !== direction) : [...blend.directions, direction] } })}>{direction === "top" ? "상" : direction === "bottom" ? "하" : direction === "left" ? "좌" : "우"}</button>)}</div></label>
      <label className={styles.field}>범위 {blend.size}px<input className={styles.range} type="range" min="40" max="420" value={blend.size} onChange={(event) => patch({ edgeBlend: { ...blend, size: Number(event.target.value) } })} /></label>
      <label className={styles.field}>강도 {blend.strength}%<input className={styles.range} type="range" min="10" max="100" value={blend.strength} onChange={(event) => patch({ edgeBlend: { ...blend, strength: Number(event.target.value) } })} /></label>
    </> : null}
  </>;
}
