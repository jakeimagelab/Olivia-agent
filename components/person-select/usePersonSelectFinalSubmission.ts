"use client";

import { useCallback, useState } from "react";

import { personSelectJsonFetch } from "./usePersonSelectPublicData";

type PersonSelectFinalSubmissionOptions = {
  slug: string;
  pendingCount: number;
  pendingErrorMessage: string;
  flushPending?: () => Promise<boolean>;
  onSubmitted: () => void;
};

export function usePersonSelectFinalSubmission({
  slug,
  pendingCount,
  pendingErrorMessage,
  flushPending,
  onSubmitted,
}: PersonSelectFinalSubmissionOptions) {
  const [submitError, setSubmitError] = useState("");
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const openSubmitReview = useCallback(async () => {
    setSubmitError("");
    if (pendingCount || (flushPending && !(await flushPending()))) {
      setSubmitError(pendingErrorMessage);
      return;
    }
    setSubmitReviewOpen(true);
  }, [flushPending, pendingCount, pendingErrorMessage]);

  const closeSubmitReview = useCallback(() => {
    if (!submitting) setSubmitReviewOpen(false);
  }, [submitting]);

  const confirmSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await personSelectJsonFetch(`/api/pick/${slug}/submit`, {
        method: "POST",
        body: JSON.stringify({ confirmed: true }),
      });
      onSubmitted();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "제출하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }, [onSubmitted, slug, submitting]);

  return {
    submitError,
    submitReviewOpen,
    submitting,
    openSubmitReview,
    closeSubmitReview,
    confirmSubmit,
  };
}
