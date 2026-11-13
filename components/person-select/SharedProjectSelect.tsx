"use client";

import { useCallback, useState } from "react";
import CustomerBridgeSelect from "@/components/select-gallery/CustomerBridgeSelect";
import type { CustomerBridgeDraft, CustomerBridgeFolderManifest, CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import type {
  PersonSelectClientImagePage,
  PersonSelectClientImageQuery,
} from "@/lib/person-select/imagePageClient";
import PersonSelectDeliveryReview from "./PersonSelectDeliveryReview";
import {
  SharedProjectClassicSelect,
  type SharedProjectEvent,
  type SharedProjectImageUrls,
  type SharedProjectReviewer,
  type SharedProjectSelection,
} from "./SharedProjectClassicSelect";
import { useSharedPersonSelectImagePages } from "./useSharedPersonSelectImagePages";
import styles from "./SharedProjectSelect.module.css";

const ALL_IMAGES_QUERY: PersonSelectClientImageQuery = { location: "all" };

export default function SharedProjectSelect({ shareToken, event, reviewer, images: initialImages, imageManifest, initialImagePage, draft, selection }: { shareToken: string; event: SharedProjectEvent; reviewer: SharedProjectReviewer; images: CustomerBridgeImage[]; imageManifest?: CustomerBridgeFolderManifest | null; initialImagePage?: PersonSelectClientImagePage | null; draft: CustomerBridgeDraft | null; selection: SharedProjectSelection }) {
  const [submitted, setSubmitted] = useState(false);
  const {
    images,
    loadNext: loadNextImagePage,
    ensureQuery: ensureImagePage,
    stateForQuery: getImagePageState,
  } = useSharedPersonSelectImagePages({ shareToken, initialImages, initialPage: initialImagePage });
  const allImagesState = getImagePageState(ALL_IMAGES_QUERY);
  const loadMoreImages = useCallback(() => loadNextImagePage(ALL_IMAGES_QUERY), [loadNextImagePage]);
  const loadImageUrls = useCallback(async (imageIds: string[], options?: { variant: SelectionMediaVariant }) => {
    const response = await fetch(`/api/pick/shared/${shareToken}/images`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageIds, variant: options?.variant }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.images) throw new Error(result.error || "사진 주소를 불러오지 못했습니다.");
    return result.images as SharedProjectImageUrls;
  }, [shareToken]);
  const refreshImageUrl = useCallback(async (imageId: string) => {
    const response = await fetch(`/api/pick/shared/${shareToken}/images/${encodeURIComponent(imageId)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.image?.image_url) throw new Error(result.error || "사진 주소를 갱신하지 못했습니다.");
    return { image_url: String(result.image.image_url), thumbnail_url: result.image.thumbnail_url ? String(result.image.thumbnail_url) : null };
  }, [shareToken]);

  if (event.customer_stage === "delivery") return <PersonSelectDeliveryReview apiBase={`/api/pick/shared/${shareToken}`} title={event.title} viewerName={reviewer.display_name} canFinalize={reviewer.can_finalize !== false} />;
  if (submitted) return <main className={styles.done}><div><h1>사진 선택을 제출했어요.</h1><p>선택 내용과 메모가 안전하게 저장됐습니다.</p><button type="button" onClick={() => setSubmitted(false)}>선택 다시 확인</button></div></main>;
  if (event.customer_view_mode !== "bridge") return <SharedProjectClassicSelect shareToken={shareToken} event={event} reviewer={reviewer} images={images} totalImageCount={imageManifest?.totalCount ?? allImagesState.totalCount ?? images.length} hasMoreImages={Boolean(allImagesState.nextCursor)} imagePageLoading={allImagesState.loading} imagePageError={allImagesState.error} loadMoreImages={loadMoreImages} draft={draft} selection={selection} onSubmitted={() => setSubmitted(true)} loadImageUrls={loadImageUrls} />;
  return <CustomerBridgeSelect shareToken={shareToken} storageScope={`person-shared:${event.id}:${reviewer.id}`} apiBase={`/api/pick/shared/${shareToken}`} qualityApi={event.customer_ai_results_visible && reviewer.can_view_ai_results ? `/api/pick/shared/${shareToken}/quality` : undefined} gallery={{ id: event.id, title: event.title, total_jpg_count: imageManifest?.totalCount ?? allImagesState.totalCount ?? images.length, allow_resubmit: true, download_jpg_enabled: event.download_available === true && reviewer.can_download_jpg === true, download_raw_enabled: event.download_available === true && reviewer.can_download_raw === true }} images={images} imageManifest={imageManifest} loadNextImagePage={loadNextImagePage} ensureImagePage={ensureImagePage} getImagePageState={getImagePageState} initialDraft={draft} initialSelection={selection} reviewer={reviewer} messagesEnabled onSubmitted={() => setSubmitted(true)} refreshImageUrl={refreshImageUrl} loadImageUrls={loadImageUrls} />;
}
