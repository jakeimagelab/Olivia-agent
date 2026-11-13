"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adjacentSelectionMediaIds,
  buildSelectionMediaRequestCandidates,
  mergeSelectionMediaUrlCache,
  reconcileSelectionMediaImages,
  type ResolvedSelectionMediaEntry,
  selectionMediaFieldKey,
  type SelectionMediaField,
  type SelectionMediaUrlCache,
  type SelectionMediaUrls,
  type SelectionMediaVariant,
} from "@/lib/select-gallery/mediaLoading";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import { useAdjacentPreviewPreload } from "./CustomerBridgeMedia";

const EMPTY_MEDIA_CACHE: SelectionMediaUrlCache = { records: {}, order: [] };

type LoadImageUrls = (
  imageIds: string[],
  options?: { variant: SelectionMediaVariant },
) => Promise<Record<string, SelectionMediaUrls>>;
type RefreshImageUrl = (
  imageId: string,
) => Promise<Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>;

function reportMediaLoadError(scope: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") console.debug(`[customer-bridge:${scope}] media request failed`, error);
}

export function useCustomerBridgeMediaStore({
  initialImages,
  refreshImageUrl,
  loadImageUrls,
}: {
  initialImages: readonly CustomerBridgeImage[];
  refreshImageUrl?: RefreshImageUrl;
  loadImageUrls?: LoadImageUrls;
}) {
  const [cache, setCache] = useState<SelectionMediaUrlCache>(EMPTY_MEDIA_CACHE);
  const refreshInFlightRef = useRef(new Map<string, Promise<void>>());
  const mediaFieldsInFlightRef = useRef(new Set<string>());
  const mediaSequenceRef = useRef(new Map<string, number>());
  const resolvedImagesRef = useRef(new Map<string, ResolvedSelectionMediaEntry<CustomerBridgeImage>>());

  const resolvedImages = useMemo(
    () => reconcileSelectionMediaImages(initialImages, cache.records, resolvedImagesRef.current),
    [cache.records, initialImages],
  );
  useEffect(() => {
    resolvedImagesRef.current = resolvedImages.entries;
  }, [resolvedImages.entries]);
  const images = resolvedImages.images;
  const imageIds = useMemo(() => new Set(images.map((image) => image.id)), [images]);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);

  const beginFieldRequest = useCallback((field: SelectionMediaField, imageId: string) => {
    const key = selectionMediaFieldKey(field, imageId);
    const sequence = (mediaSequenceRef.current.get(key) ?? 0) + 1;
    mediaSequenceRef.current.set(key, sequence);
    mediaFieldsInFlightRef.current.add(key);
    return sequence;
  }, []);

  const finishFieldRequest = useCallback((field: SelectionMediaField, imageId: string, sequence: number) => {
    const key = selectionMediaFieldKey(field, imageId);
    if (mediaSequenceRef.current.get(key) === sequence) mediaFieldsInFlightRef.current.delete(key);
  }, []);

  const mergeAcceptedUrls = useCallback((updates: Record<string, SelectionMediaUrls>) => {
    if (!Object.keys(updates).length) return;
    setCache((current) => mergeSelectionMediaUrlCache(current, updates));
  }, []);

  const requestMedia = useCallback(async (requestedIds: readonly string[], variant: SelectionMediaVariant) => {
    if (!loadImageUrls) return;
    const candidates = buildSelectionMediaRequestCandidates({
      imagesById: imageById,
      requestedIds,
      variant,
      inFlightKeys: mediaFieldsInFlightRef.current,
    });
    const requests = candidates.map(({ imageId, fields }) => ({
      imageId,
      fields,
      sequences: Object.fromEntries(fields.map((field) => [field, beginFieldRequest(field, imageId)])) as Record<SelectionMediaField, number>,
    }));
    if (!requests.length) return;

    try {
      const urlsById = await loadImageUrls(requests.map(({ imageId }) => imageId), { variant });
      const accepted: Record<string, SelectionMediaUrls> = {};
      for (const request of requests) {
        const urls = urlsById[request.imageId];
        if (!urls) continue;
        const next: SelectionMediaUrls = {};
        if (request.fields.includes("thumbnail")
          && mediaSequenceRef.current.get(selectionMediaFieldKey("thumbnail", request.imageId)) === request.sequences.thumbnail
          && urls.thumbnail_url !== undefined) {
          next.thumbnail_url = urls.thumbnail_url;
        }
        if (request.fields.includes("preview")
          && mediaSequenceRef.current.get(selectionMediaFieldKey("preview", request.imageId)) === request.sequences.preview
          && urls.image_url !== undefined) {
          next.image_url = urls.image_url;
        }
        if (Object.keys(next).length) accepted[request.imageId] = next;
      }
      mergeAcceptedUrls(accepted);
    } catch (error) {
      reportMediaLoadError(`batch-${variant}`, error);
    } finally {
      for (const request of requests) {
        for (const field of request.fields) finishFieldRequest(field, request.imageId, request.sequences[field]);
      }
    }
  }, [beginFieldRequest, finishFieldRequest, imageById, loadImageUrls, mergeAcceptedUrls]);

  const handleImageError = useCallback((imageId: string) => {
    if (!refreshImageUrl || refreshInFlightRef.current.has(imageId)) return;
    const thumbnailSequence = beginFieldRequest("thumbnail", imageId);
    const previewSequence = beginFieldRequest("preview", imageId);
    const request = refreshImageUrl(imageId)
      .then((urls) => {
        const accepted: SelectionMediaUrls = {};
        if (mediaSequenceRef.current.get(selectionMediaFieldKey("thumbnail", imageId)) === thumbnailSequence && urls.thumbnail_url !== undefined) accepted.thumbnail_url = urls.thumbnail_url;
        if (mediaSequenceRef.current.get(selectionMediaFieldKey("preview", imageId)) === previewSequence) accepted.image_url = urls.image_url;
        if (Object.keys(accepted).length) mergeAcceptedUrls({ [imageId]: accepted });
      })
      .catch((error) => reportMediaLoadError("refresh", error))
      .finally(() => {
        finishFieldRequest("thumbnail", imageId, thumbnailSequence);
        finishFieldRequest("preview", imageId, previewSequence);
        refreshInFlightRef.current.delete(imageId);
      });
    refreshInFlightRef.current.set(imageId, request);
  }, [beginFieldRequest, finishFieldRequest, mergeAcceptedUrls, refreshImageUrl]);

  return { images, imageIds, imageById, handleImageError, requestMedia };
}

export function useCustomerBridgeMediaRequests({
  renderedImages,
  visibleImages,
  focusedImageId,
  fullscreenId,
  reviewImages,
  reviewActiveId,
  requestMedia,
}: {
  renderedImages: readonly CustomerBridgeImage[];
  visibleImages: readonly CustomerBridgeImage[];
  focusedImageId: string | null;
  fullscreenId: string | null;
  reviewImages: readonly CustomerBridgeImage[];
  reviewActiveId: string | null;
  requestMedia: (imageIds: readonly string[], variant: SelectionMediaVariant) => Promise<void>;
}) {
  useEffect(() => {
    void requestMedia(renderedImages.map((image) => image.id), "thumbnail");
  }, [renderedImages, requestMedia]);

  useEffect(() => {
    const requested = new Set([
      ...adjacentSelectionMediaIds(visibleImages, focusedImageId),
      ...adjacentSelectionMediaIds(visibleImages, fullscreenId),
      ...adjacentSelectionMediaIds(reviewImages, reviewActiveId),
    ]);
    void requestMedia([...requested], "preview");
  }, [focusedImageId, fullscreenId, requestMedia, reviewActiveId, reviewImages, visibleImages]);

  useAdjacentPreviewPreload(visibleImages, fullscreenId ?? focusedImageId);
  useAdjacentPreviewPreload(reviewImages, reviewActiveId);
}
