"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BRIDGE_COLOR_LABELS } from "@/lib/photo-bridge/labels";
import type {
  CustomerBridgeColorLabel,
  CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";

function createRequestKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `bridge_${crypto.randomUUID()}`;
  return `bridge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function useCustomerBridgeSubmission({
  endpointBase,
  localStorageScope,
  readOnly,
  selectedIds,
  ratings,
  colorLabels,
  notes,
  images,
  pendingCount,
  flushNow,
  getRevision,
  onSubmitted,
  onStorageError,
}: {
  endpointBase: string;
  localStorageScope: string;
  readOnly: boolean;
  selectedIds: ReadonlySet<string>;
  ratings: Record<string, CustomerBridgeRating>;
  colorLabels: Record<string, CustomerBridgeColorLabel>;
  notes: Record<string, string>;
  images: CustomerBridgeImage[];
  pendingCount: number;
  flushNow: () => Promise<boolean>;
  getRevision: () => number;
  onSubmitted: (selection: unknown) => void;
  onStorageError: (scope: string, error: unknown) => void;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const requestKeyRef = useRef(createRequestKey());

  useEffect(() => {
    if (readOnly) return;
    try {
      const storageKey = `customer-bridge-submit-key:${localStorageScope}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) requestKeyRef.current = stored;
      else localStorage.setItem(storageKey, requestKeyRef.current);
    } catch (storageError) {
      onStorageError("submit-key", storageError);
    }
  }, [localStorageScope, onStorageError, readOnly]);

  const openReview = useCallback(async () => {
    if (!selectedIds.size || submitting || pendingCount) return;
    setError("");
    const saved = await flushNow();
    if (!saved) return;
    setReviewOpen(true);
  }, [flushNow, pendingCount, selectedIds, submitting]);

  const closeReview = useCallback(() => {
    if (!submitting) setReviewOpen(false);
  }, [submitting]);

  const submit = useCallback(async () => {
    if (!selectedIds.size || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${endpointBase}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: getRevision(), requestKey: requestKeyRef.current, confirmed: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error ?? "최종 제출에 실패했습니다.");
      requestKeyRef.current = createRequestKey();
      try {
        localStorage.removeItem(`customer-bridge-submit-key:${localStorageScope}`);
      } catch (storageError) {
        onStorageError("submit-key-clear", storageError);
      }
      onSubmitted(result.selection);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "최종 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [endpointBase, getRevision, localStorageScope, onStorageError, onSubmitted, selectedIds, submitting]);

  const reviewItems = useMemo(() => {
    if (!reviewOpen) return [];
    const items = [];
    for (const image of images) {
      if (!selectedIds.has(image.id)) continue;
      const detail = [
        ratings[image.id] ? `★${ratings[image.id]}` : "",
        colorLabels[image.id] ? BRIDGE_COLOR_LABELS[colorLabels[image.id]].name : "",
        notes[image.id]?.trim() ? "보정 메모 있음" : "",
      ].filter(Boolean).join(" · ");
      items.push({
        id: image.id,
        fileName: image.original_file_name,
        thumbnailUrl: image.thumbnail_url || image.image_url,
        detail,
      });
      if (items.length === 12) break;
    }
    return items;
  }, [colorLabels, images, notes, ratings, reviewOpen, selectedIds]);

  const reviewSections = useMemo(() => {
    if (!reviewOpen) return [];
    let ratingCount = 0;
    let colorCount = 0;
    let memoCount = 0;
    for (const id of selectedIds) {
      if (ratings[id]) ratingCount += 1;
      if (colorLabels[id]) colorCount += 1;
      if (notes[id]?.trim()) memoCount += 1;
    }
    return [
      { label: "별점 셀렉", count: ratingCount },
      { label: "컬러 셀렉", count: colorCount },
      { label: "보정 메모", count: memoCount },
    ];
  }, [colorLabels, notes, ratings, reviewOpen, selectedIds]);

  return {
    error,
    setError,
    submitting,
    reviewOpen,
    openReview,
    closeReview,
    submit,
    reviewItems,
    reviewSections,
  };
}
