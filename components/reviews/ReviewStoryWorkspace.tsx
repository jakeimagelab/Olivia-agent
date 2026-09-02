"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Building2, Check, ChevronDown,
  Download, Eye, EyeOff, ImagePlus, Lock, Minus, Plus, Quote, Redo2, Save, Send,
  Sparkles, Star, Trash2, Undo2, Unlock, Upload, ZoomIn, ZoomOut,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { createMailingDraft } from "@/lib/mailingQueue";
import {
  createReviewStoryDocument, duplicateStoryElement, isReviewStoryDocument,
  toReviewStoryTemplateDocument,
  type ReviewStoryDocument, type ReviewStoryElement, type ReviewStoryImageElement,
  type ReviewStoryTemplateConfig,
} from "@/lib/reviewContent/storyDocument";
import { renderReviewStoryDocument } from "@/lib/reviewContent/renderStoryDocument.client";
import ReviewStoryCanvas from "./ReviewStoryCanvas";
import styles from "./ReviewStoryWorkspace.module.css";

type Review = {
  id: string;
  client_id?: string;
  hospital_name: string;
  reviewer_name?: string;
  review_text: string;
  delivered_at?: string;
  permission_to_publish?: boolean;
};

type LayoutAsset = {
  id: string;
  name: string;
  description?: string;
  layout_config?: ReviewStoryTemplateConfig;
  thumbnailUrl?: string | null;
};

type Variant = {
  id: string;
  image_storage_path: string;
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
type StoryPage = Variant & { document: ReviewStoryDocument };

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
      const stored = variant.generation_metadata?.editorDocument;
      const layout = variant.review_layout_assets || layouts.find((item) => item.id === variant.layout_asset_id);
      return {
        ...variant,
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

export default function ReviewStoryWorkspace() {
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
  const [zoom, setZoom] = useState(82);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<ReviewStoryDocument[]>([]);
  const [future, setFuture] = useState<ReviewStoryDocument[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState({ hospitalName: "", doctorName: "", date: "", reviewText: "" });

  const activeContent = useMemo(() => contents.find((item) => item.id === activeContentId) || null, [contents, activeContentId]);
  const activePage = useMemo(() => pages.find((page) => page.id === activePageId) || pages[0] || null, [pages, activePageId]);
  const selectedElement = useMemo(() => activePage?.document.elements.find((element) => element.id === selectedElementId) || null, [activePage, selectedElementId]);

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
          const documentValue = createReviewStoryDocument({ ...source, photo }, layout?.layout_config || {});
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

  const uploadRenderedPage = async (page: StoryPage) => {
    const blob = await renderReviewStoryDocument(page.document, { ...assetUrls, ...(page.assetUrls || {}) });
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
    if (!activeContent || !activePage) return notify("먼저 스토리를 생성해 주세요.", true);
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
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "저장에 실패했습니다.", true);
    } finally { setBusy(""); }
  };

  const exportPng = async () => {
    if (!activePage) return notify("내보낼 스토리가 없습니다.", true);
    setBusy("export");
    try {
      const blob = await renderReviewStoryDocument(activePage.document, { ...assetUrls, ...(activePage.assetUrls || {}) });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${source.hospitalName || "review"}-story-${pages.findIndex((page) => page.id === activePage.id) + 1}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify("1080×1350 PNG를 내보냈습니다.");
    } catch (exportError) {
      notify(exportError instanceof Error ? exportError.message : "PNG 내보내기에 실패했습니다.", true);
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
        body: JSON.stringify({ name, description: "리뷰 스토리 편집기에서 저장", ratio: "4:5", assetType: "builtin", layoutConfig: { template: "text_only", background: activePage.document.background, editorDocument: toReviewStoryTemplateDocument(activePage.document) } }),
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
      await save();
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
    return <main className={styles.workspace}><div className={styles.loadingState}>리뷰 정보를 불러오는 중…</div></main>;
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <Link href="/clients/reviews" className={styles.button} style={{ marginBottom: 8, width: "fit-content", textDecoration: "none" }}>
            <ArrowLeft size={13} /><span>리뷰 관리로 돌아가기</span>
          </Link>
          <div className={styles.titleRow}><h1 className={styles.title}>리뷰 콘텐츠 제작</h1><span className={styles.badge}>통합</span></div>
          <p className={styles.subtitle}>후기와 사진을 바탕으로 병원 리뷰 콘텐츠를 빠르게 제작합니다.</p>
        </div>
        <div className={styles.headerActions}>
          {activeContent?.status === "approved" ? <button className={`${styles.button} ${styles.primary}`} onClick={() => void publish()} disabled={Boolean(busy)}><Send size={14} /><span>Instagram 게시</span></button> : null}
          {activeContent && !["approved", "published"].includes(activeContent.status) ? <button className={styles.button} onClick={() => void approve()} disabled={Boolean(busy)}><Check size={14} /><span>대표 승인</span></button> : null}
          <button className={styles.button} onClick={() => void save()} disabled={Boolean(busy) || !activePage}><Save size={14} /><span>저장</span></button>
          <button className={styles.button} onClick={() => void saveTemplate()} disabled={Boolean(busy) || !activePage}><Sparkles size={14} /><span>템플릿으로 저장</span></button>
          <button className={`${styles.button} ${styles.primary}`} onClick={() => void exportPng()} disabled={Boolean(busy) || !activePage}><Download size={14} /><span>PNG 내보내기</span><ChevronDown size={12} /></button>
        </div>
      </header>

      {message ? <div className={`${styles.status} ${error ? styles.error : ""}`} role="status">{message}</div> : null}

      <div className={styles.editorGrid}>
        <aside className={`${styles.panel} ${styles.leftPanel}`} aria-label="리뷰 입력과 소스">
          <section className={styles.section}>
            <div className={styles.sectionHeader}><div><h2 className={styles.sectionTitle}>후기 정보 입력</h2><p className={styles.helper}>기존 후기를 선택하거나 새 후기를 작성하세요.</p></div></div>
            <label className={styles.field}>기존 리뷰
              <select className={`${styles.select} ${styles.reviewPicker}`} value={selectedReviewId} onChange={(event) => selectReview(event.target.value)}>
                <option value="">새 리뷰 작성</option>
                {reviews.map((review) => <option key={review.id} value={review.id}>{review.hospital_name} · {review.review_text.slice(0, 24)}</option>)}
              </select>
            </label>
            <label className={styles.field}>후기 텍스트
              <textarea className={styles.textarea} value={source.reviewText} onChange={(event) => setSource((current) => ({ ...current, reviewText: event.target.value }))} placeholder="고객이 남긴 후기를 입력해 주세요." />
            </label>
            <div className={styles.sourceActions}><span className={styles.count}>{source.reviewText.length.toLocaleString()}자</span><button type="button" className={styles.subtleButton} onClick={() => void generateStories()} disabled={Boolean(busy)}>문구 정리하기 ✨</button></div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>병원 정보</h2>
            <label className={styles.field}>병원명<input className={styles.input} value={source.hospitalName} onChange={(event) => setSource((current) => ({ ...current, hospitalName: event.target.value }))} placeholder="춘천 가두리한의원" /></label>
            <label className={styles.field}>원장명<input className={styles.input} value={source.doctorName} onChange={(event) => setSource((current) => ({ ...current, doctorName: event.target.value }))} placeholder="김윤일 원장님" /></label>
            <label className={styles.field}>촬영일 또는 리뷰일<input className={styles.input} type="date" value={source.date || ""} onChange={(event) => setSource((current) => ({ ...current, date: event.target.value }))} /></label>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>사진 업로드 ({photos.length}장)</h2><button type="button" className={styles.subtleButton} onClick={() => photoInputRef.current?.click()}><Upload size={12} /> 사진 추가</button></div>
            <div className={styles.photoGrid}>
              {photos.map((photo) => <button type="button" key={photo.id} draggable className={styles.photoThumb} title={`${photo.name} · 드래그해서 순서 변경`} onDragStart={(event) => event.dataTransfer.setData("text/review-photo", photo.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData("text/review-photo"); setPhotos((current) => { const from = current.findIndex((item) => item.id === sourceId); const to = current.findIndex((item) => item.id === photo.id); if (from < 0 || to < 0) return current; const next = [...current]; const [moving] = next.splice(from, 1); next.splice(to, 0, moving); return next; }); }} onClick={() => applyPhoto(photo)}><img src={photo.src} alt={photo.name} /><span className={styles.photoDelete} onClick={(event) => { event.stopPropagation(); setPhotos((current) => current.filter((item) => item.id !== photo.id)); }}>×</span></button>)}
              <button type="button" className={styles.photoAdd} onClick={() => photoInputRef.current?.click()} aria-label="사진 추가"><ImagePlus size={20} /></button>
            </div>
            <input ref={photoInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void uploadPhotos(event.target.files)} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>템플릿 선택</h2><span className={styles.count}>{selectedTemplateIds.length}개 선택</span></div>
            <div className={styles.templateList}>
              {layouts.map((layout, index) => {
                const selected = selectedTemplateIds.includes(layout.id);
                return <button key={layout.id} type="button" className={`${styles.template} ${selected ? styles.templateSelected : ""}`} aria-pressed={selected} onClick={() => setSelectedTemplateIds((current) => current.includes(layout.id) ? current.filter((id) => id !== layout.id) : [...current, layout.id].slice(-6))}><span className={styles.templateNumber}>{String(index + 1).padStart(2, "0")} {selected ? "✓" : ""}</span>{layout.name}</button>;
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

        <section className={styles.center} aria-label="스토리 편집기">
          <div className={styles.toolbar}>
            <div className={styles.toolbarGroup}><button className={styles.iconButton} onClick={undo} disabled={!history.length} aria-label="실행 취소"><Undo2 size={15} /></button><button className={styles.iconButton} onClick={redo} disabled={!future.length} aria-label="다시 실행"><Redo2 size={15} /></button></div>
            <div className={styles.toolbarGroup}><button className={styles.iconButton} onClick={() => setZoom((value) => Math.max(38, value - 8))} aria-label="축소"><ZoomOut size={14} /></button><span className={styles.zoomLabel}>{zoom}%</span><button className={styles.iconButton} onClick={() => setZoom((value) => Math.min(100, value + 8))} aria-label="확대"><ZoomIn size={14} /></button><button className={styles.button} onClick={() => setZoom(82)}>맞춤</button></div>
          </div>
          {activePage ? <ReviewStoryCanvas document={activePage.document} selectedElementId={selectedElementId} assetUrls={{ ...assetUrls, ...(activePage.assetUrls || {}) }} zoom={zoom} onSelect={setSelectedElementId} onChange={replaceActiveDocument} /> : <div className={styles.propertyEmpty} style={{ alignSelf: "center" }}><Sparkles size={28} /><br />왼쪽에서 후기를 선택하고<br />스토리를 자동 생성하세요.</div>}
        </section>

        <aside className={`${styles.panel} ${styles.rightPanel}`} aria-label="요소 속성과 레이어">
          <section className={styles.section}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>{selectedElement?.type === "image" ? "이미지 편집" : selectedElement?.type === "text" ? "텍스트 편집" : "요소 속성"}</h2>{selectedElement ? <span className={styles.count}>{selectedElement.name}</span> : null}</div>
            {!selectedElement ? <div className={styles.propertyEmpty}>캔버스에서 텍스트나 사진을 선택하면<br />편집 도구가 표시됩니다.</div> : (
              <>
                <div className={styles.propertyGrid}>
                  {(["x", "y", "width", "height"] as const).map((key) => <label key={key} className={styles.field}>{key.toUpperCase()}<input className={styles.input} type="number" value={Math.round(selectedElement[key])} onChange={(event) => patchElement(selectedElement.id, { [key]: Number(event.target.value) })} /></label>)}
                  <label className={styles.field}>회전<input className={styles.input} type="number" value={selectedElement.rotation} onChange={(event) => patchElement(selectedElement.id, { rotation: Number(event.target.value) })} /></label>
                  <label className={styles.field}>불투명도<input className={styles.input} type="number" min="0" max="100" value={Math.round(selectedElement.opacity * 100)} onChange={(event) => patchElement(selectedElement.id, { opacity: Number(event.target.value) / 100 })} /></label>
                </div>
                {selectedElement.type === "text" ? (
                  <>
                    <label className={styles.field}>내용<textarea className={styles.textarea} value={selectedElement.text} onChange={(event) => patchElement(selectedElement.id, { text: event.target.value } as Partial<ReviewStoryElement>)} /></label>
                    <div className={styles.propertyGrid}><label className={styles.field}>크기<input className={styles.input} type="number" value={selectedElement.fontSize} onChange={(event) => patchElement(selectedElement.id, { fontSize: Number(event.target.value) } as Partial<ReviewStoryElement>)} /></label><label className={styles.field}>굵기<select className={styles.select} value={selectedElement.fontWeight} onChange={(event) => patchElement(selectedElement.id, { fontWeight: Number(event.target.value) } as Partial<ReviewStoryElement>)}><option value="400">Regular</option><option value="600">Semi Bold</option><option value="700">Bold</option><option value="800">Extra Bold</option></select></label><label className={styles.field}>행간<input className={styles.input} type="number" min="0.8" max="3" step="0.05" value={selectedElement.lineHeight} onChange={(event) => patchElement(selectedElement.id, { lineHeight: Number(event.target.value) } as Partial<ReviewStoryElement>)} /></label><label className={styles.field}>자간<input className={styles.input} type="number" step="0.2" value={selectedElement.letterSpacing} onChange={(event) => patchElement(selectedElement.id, { letterSpacing: Number(event.target.value) } as Partial<ReviewStoryElement>)} /></label></div>
                    <label className={styles.field}>텍스트 색상<input className={styles.input} type="color" value={selectedElement.color} onChange={(event) => patchElement(selectedElement.id, { color: event.target.value } as Partial<ReviewStoryElement>)} /></label>
                    <div className={styles.segmented}>{([{ value: "left", icon: AlignLeft }, { value: "center", icon: AlignCenter }, { value: "right", icon: AlignRight }] as const).map(({ value, icon: Icon }) => <button key={value} className={`${styles.segment} ${selectedElement.textAlign === value ? styles.segmentActive : ""}`} onClick={() => patchElement(selectedElement.id, { textAlign: value } as Partial<ReviewStoryElement>)}><Icon size={13} /></button>)}</div>
                  </>
                ) : null}
                {selectedElement.type === "image" ? <ImageProperties element={selectedElement} patch={(value) => patchElement(selectedElement.id, value as Partial<ReviewStoryElement>)} onReplace={() => photoInputRef.current?.click()} /> : null}
              </>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>레이어</h2><span className={styles.count}>{activePage?.document.elements.length || 0}개</span></div>
            <div className={styles.layers}>
              {[...(activePage?.document.elements || [])].sort((a, b) => b.zIndex - a.zIndex).map((element) => <div key={element.id} className={`${styles.layer} ${selectedElementId === element.id ? styles.layerSelected : ""}`} onClick={() => setSelectedElementId(element.id)}><button className={styles.layerIcon} aria-label={element.hidden ? "레이어 표시" : "레이어 숨기기"} onClick={(event) => { event.stopPropagation(); patchElement(element.id, { hidden: !element.hidden }); }}>{element.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button><span>{element.name}</span><button className={styles.layerIcon} aria-label={element.locked ? "잠금 해제" : "잠금"} onClick={(event) => { event.stopPropagation(); patchElement(element.id, { locked: !element.locked }); }}>{element.locked ? <Lock size={12} /> : <Unlock size={12} />}</button></div>)}
            </div>
            <div className={styles.layerFooter}><button className={styles.iconButton} onClick={() => moveLayer(1)} disabled={!selectedElement}><ArrowUp size={13} /></button><button className={styles.iconButton} onClick={() => moveLayer(-1)} disabled={!selectedElement}><ArrowDown size={13} /></button><button className={styles.iconButton} onClick={deleteSelectedElement} disabled={!selectedElement || selectedElement.locked}><Trash2 size={13} /></button></div>
          </section>
        </aside>
      </div>

      <section className={styles.storyStrip} aria-label="생성된 스토리">
        <div className={styles.storyStripHeader}><h2 className={styles.sectionTitle}>생성된 스토리 ({pages.length}장)</h2><div className={styles.toolbarGroup}><button className={styles.iconButton} onClick={() => void reorderPage(-1)} disabled={!activePage}><ArrowUp size={13} /></button><button className={styles.iconButton} onClick={() => void reorderPage(1)} disabled={!activePage}><ArrowDown size={13} /></button><button className={styles.iconButton} onClick={() => void removePage()} disabled={!activePage || pages.length <= 1}><Trash2 size={13} /></button></div></div>
        {pages.length ? <div className={styles.storyList}>{pages.map((page, index) => <button key={page.id} type="button" draggable className={`${styles.storyThumb} ${activePage?.id === page.id ? styles.storyThumbActive : ""}`} title="드래그해서 페이지 순서 변경" onDragStart={(event) => event.dataTransfer.setData("text/review-page", page.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void movePageTo(event.dataTransfer.getData("text/review-page"), page.id); }} onClick={() => { setActivePageId(page.id); setSelectedElementId(null); setHistory([]); setFuture([]); }}><img className={styles.storyPreview} src={page.imageUrl || ""} alt={`${index + 1}번 스토리`} /><span className={styles.storyNumber}>{String(index + 1).padStart(2, "0")}{page.is_selected ? " · 대표" : ""}</span></button>)}</div> : <div className={styles.emptyStrip}>아직 생성된 스토리가 없습니다.</div>}
      </section>
    </main>
  );
}

function ImageProperties({ element, patch, onReplace }: { element: ReviewStoryImageElement; patch: (value: Partial<ReviewStoryImageElement>) => void; onReplace: () => void }) {
  const blend = element.edgeBlend || { enabled: false, type: "gradient" as const, directions: ["bottom" as const], size: 180, strength: 80 };
  const directions = ["top", "bottom", "left", "right"] as const;
  return <>
    <div className={styles.sourceActions}><button className={styles.button} onClick={onReplace}><ImagePlus size={13} /> 교체</button><button className={styles.button} onClick={() => patch({ cropX: 50, cropY: 50, scale: 1 })}>자르기 초기화</button></div>
    <label className={styles.field}>사진 확대 / 자르기<input className={styles.range} type="range" min="1" max="3" step="0.05" value={element.scale} onChange={(event) => patch({ scale: Number(event.target.value) })} /></label>
    <div className={styles.propertyGrid}><label className={styles.field}>가로 위치<input className={styles.range} type="range" min="0" max="100" value={element.cropX} onChange={(event) => patch({ cropX: Number(event.target.value) })} /></label><label className={styles.field}>세로 위치<input className={styles.range} type="range" min="0" max="100" value={element.cropY} onChange={(event) => patch({ cropY: Number(event.target.value) })} /></label></div>
    <label className={styles.field} style={{ display: "flex", gridTemplateColumns: "1fr auto", alignItems: "center" }}>경계 블렌딩<input type="checkbox" checked={blend.enabled} onChange={(event) => patch({ edgeBlend: { ...blend, enabled: event.target.checked } })} /></label>
    {blend.enabled ? <>
      <div className={styles.segmented}><button className={`${styles.segment} ${blend.type === "gradient" ? styles.segmentActive : ""}`} onClick={() => patch({ edgeBlend: { ...blend, type: "gradient" } })}>그라데이션</button><button className={`${styles.segment} ${blend.type === "blur" ? styles.segmentActive : ""}`} onClick={() => patch({ edgeBlend: { ...blend, type: "blur" } })}>블러</button></div>
      <label className={styles.field}>방향<div className={styles.segmented} style={{ gridTemplateColumns: "repeat(4,1fr)" }}>{directions.map((direction) => <button key={direction} className={`${styles.segment} ${blend.directions.includes(direction) ? styles.segmentActive : ""}`} onClick={() => patch({ edgeBlend: { ...blend, directions: blend.directions.includes(direction) ? blend.directions.filter((item) => item !== direction) : [...blend.directions, direction] } })}>{direction === "top" ? "상" : direction === "bottom" ? "하" : direction === "left" ? "좌" : "우"}</button>)}</div></label>
      <label className={styles.field}>범위 {blend.size}px<input className={styles.range} type="range" min="40" max="420" value={blend.size} onChange={(event) => patch({ edgeBlend: { ...blend, size: Number(event.target.value) } })} /></label>
      <label className={styles.field}>강도 {blend.strength}%<input className={styles.range} type="range" min="10" max="100" value={blend.strength} onChange={(event) => patch({ edgeBlend: { ...blend, strength: Number(event.target.value) } })} /></label>
    </> : null}
  </>;
}
