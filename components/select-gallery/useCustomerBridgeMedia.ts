"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adjacentSelectionMediaIds,
  mergeSelectionMediaUrlCache,
  SELECTION_THUMBNAIL_PAGE_SIZE,
  type SelectionMediaUrlCache,
  type SelectionMediaUrls,
  type SelectionMediaVariant,
} from "@/lib/select-gallery/mediaLoading";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import { useAdjacentPreviewPreload } from "./CustomerBridgeMedia";

const EMPTY_MEDIA_CACHE: SelectionMediaUrlCache = { records: {}, order: [] };

type MediaField = "thumbnail" | "preview";
type LoadImageUrls = (
  imageIds: string[],
  options?: { variant: SelectionMediaVariant },
) => Promise<Record<string, SelectionMediaUrls>>;
type RefreshImageUrl = (
  imageId: string,
) => Promise<Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>;

function mediaFieldsForVariant(variant: SelectionMediaVariant): MediaField[] {
  if (variant === "thumbnail") return ["thumbnail"];
  if (variant === "preview") return ["preview"];
  return ["thumbnail", "preview"];
}

function mediaFieldKey(field: MediaField, imageId: string) {
  return `${field}:${imageId}`;
}

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

  const images = useMemo(
    () => initialImages.map((image) => cache.records[image.id] ? { ...image, ...cache.records[image.id] } : image),
    [cache.records, initialImages],
  );
  const imageIds = useMemo(() => new Set(images.map((image) => image.id)), [images]);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);

  const beginFieldRequest = useCallback((field: MediaField, imageId: string) => {
    const key = mediaFieldKey(field, imageId);
    const sequence = (mediaSequenceRef.current.get(key) ?? 0) + 1;
    mediaSequenceRef.current.set(key, sequence);
    mediaFieldsInFlightRef.current.add(key);
    return sequence;
  }, []);

  const finishFieldRequest = useCallback((field: MediaField, imageId: string, sequence: number) => {
    const key = mediaFieldKey(field, imageId);
    if (mediaSequenceRef.current.get(key) === sequence) mediaFieldsInFlightRef.current.delete(key);
  }, []);

  const mergeAcceptedUrls = useCallback((updates: Record<string, SelectionMediaUrls>) => {
    if (!Object.keys(updates).length) return;
    setCache((current) => mergeSelectionMediaUrlCache(current, updates));
  }, []);

  const requestMedia = useCallback(async (requestedIds: readonly string[], variant: SelectionMediaVariant) => {
    if (!loadImageUrls) return;
    const fields = mediaFieldsForVariant(variant);
    const candidates = [...new Set(requestedIds)].flatMap((imageId) => {
      const image = imageById.get(imageId);
      if (!image) return [];
      const missingFields = fields.filter((field) => {
        const hasUrl = field === "thumbnail" ? Boolean(image.thumbnail_url) : Boolean(image.image_url);
        return !hasUrl && !mediaFieldsInFlightRef.current.has(mediaFieldKey(field, imageId));
      });
      if (!missingFields.length) return [];
      return [{ imageId, fields: missingFields }];
    });
    const requestLimit = variant === "thumbnail" ? SELECTION_THUMBNAIL_PAGE_SIZE : candidates.length;
    const requests = candidates.slice(0, requestLimit).map(({ imageId, fields }) => ({
      imageId,
      fields,
      sequences: Object.fromEntries(fields.map((field) => [field, beginFieldRequest(field, imageId)])) as Record<MediaField, number>,
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
          && mediaSequenceRef.current.get(mediaFieldKey("thumbnail", request.imageId)) === request.sequences.thumbnail
          && urls.thumbnail_url !== undefined) {
          next.thumbnail_url = urls.thumbnail_url;
        }
        if (request.fields.includes("preview")
          && mediaSequenceRef.current.get(mediaFieldKey("preview", request.imageId)) === request.sequences.preview
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
        if (mediaSequenceRef.current.get(mediaFieldKey("thumbnail", imageId)) === thumbnailSequence && urls.thumbnail_url !== undefined) accepted.thumbnail_url = urls.thumbnail_url;
        if (mediaSequenceRef.current.get(mediaFieldKey("preview", imageId)) === previewSequence) accepted.image_url = urls.image_url;
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
