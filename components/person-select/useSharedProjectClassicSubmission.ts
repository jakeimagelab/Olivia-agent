"use client";

import { useCallback, useRef, useState } from "react";

function createSharedSelectionRequestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `shared_${crypto.randomUUID()}`
    : `shared_${Date.now()}`;
}

export function useSharedProjectClassicSubmission({
  shareToken,
  selectedCount,
  pending,
  flushSelection,
  flushMemo,
  onSubmitted,
  onError,
}: {
  shareToken: string;
  selectedCount: number;
  pending: boolean;
  flushSelection: () => Promise<boolean>;
  flushMemo: () => Promise<boolean>;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestKeyRef = useRef(createSharedSelectionRequestKey());

  const openReview = useCallback(async () => {
    if (!selectedCount || pending) return;
    if (!(await flushSelection()) || !(await flushMemo())) {
      onError("저장 안 된 변경이 있어 제출할 수 없습니다.");
      return;
    }
    setReviewOpen(true);
  }, [flushMemo, flushSelection, onError, pending, selectedCount]);

  const closeReview = useCallback(() => {
    if (!submitting) setReviewOpen(false);
  }, [submitting]);

  const submit = useCallback(async () => {
    if (!selectedCount || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/pick/shared/${shareToken}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: requestKeyRef.current,
          confirmed: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        onError(result.error || "제출 실패");
        return;
      }
      onSubmitted();
    } catch (error) {
      onError(error instanceof Error ? error.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
  }, [onError, onSubmitted, selectedCount, shareToken, submitting]);

  return {
    reviewOpen,
    submitting,
    openReview,
    closeReview,
    submit,
  };
}
