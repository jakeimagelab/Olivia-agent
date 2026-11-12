"use client";

import { useState } from "react";

import type { PersonSelectSharedReviewer } from "@/lib/person-select/adminData";

type ReviewerPermissionKey = "canViewAiResults" | "canDownloadJpg" | "canDownloadRaw" | "canFinalize";

export function usePersonSelectReviewerActions({
  eventId,
  isShared,
  load,
  setSelectedReviewerId,
  setMessage,
}: {
  eventId: string;
  isShared: boolean;
  load: () => Promise<void>;
  setSelectedReviewerId: (id: string | null) => void;
  setMessage: (message: string) => void;
}) {
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [issuedReviewerTokens, setIssuedReviewerTokens] = useState<Record<string, string>>({});

  async function regenerateSharedLink() {
    if (!isShared || !window.confirm("기존 공용 링크는 즉시 사용할 수 없게 됩니다. 새 링크를 만들까요?")) return;
    setMessage("");
    const response = await fetch(`/api/person-select/${eventId}/regenerate-shared-token`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setMessage(body.error || "공용 링크를 다시 만들지 못했습니다.");
    await load();
  }

  async function createReviewer() {
    if (!reviewerName.trim()) return setMessage("검토자 이름을 입력해 주세요.");
    setMessage("");
    const response = await fetch(`/api/person-select/${eventId}/reviewers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: reviewerName, roleLabel: reviewerRole }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setMessage(body.error || "검토자를 추가하지 못했습니다.");
    setIssuedReviewerTokens((current) => ({ ...current, [body.reviewer.id]: body.token }));
    setSelectedReviewerId(body.reviewer.id);
    setReviewerName("");
    setReviewerRole("");
    await load();
  }

  async function regenerateReviewerLink(reviewer: PersonSelectSharedReviewer) {
    if (!window.confirm(`${reviewer.display_name}의 기존 링크는 즉시 사용할 수 없게 됩니다. 새 링크를 만들까요?`)) return;
    setMessage("");
    const response = await fetch(`/api/person-select/${eventId}/reviewers/${reviewer.id}/regenerate-token`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setMessage(body.error || "검토자 링크를 다시 만들지 못했습니다.");
    setIssuedReviewerTokens((current) => ({ ...current, [reviewer.id]: body.token }));
    await load();
  }

  async function setReviewerActive(reviewer: PersonSelectSharedReviewer, active: boolean) {
    setMessage("");
    const response = await fetch(`/api/person-select/${eventId}/reviewers/${reviewer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setMessage(body.error || "검토자 상태를 바꾸지 못했습니다.");
    await load();
  }

  async function setReviewerPermission(
    reviewer: PersonSelectSharedReviewer,
    key: ReviewerPermissionKey,
    value: boolean,
  ) {
    setMessage("");
    const response = await fetch(`/api/person-select/${eventId}/reviewers/${reviewer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setMessage(body.error || "검토자 권한을 바꾸지 못했습니다.");
    await load();
  }

  async function copyReviewerLink(reviewerId: string) {
    const token = issuedReviewerTokens[reviewerId];
    if (!token) return setMessage("보안상 링크는 발급 직후에만 확인됩니다. 링크 재발급 후 복사해 주세요.");
    await navigator.clipboard.writeText(`${location.origin}/pick/shared/${token}`);
    setMessage("검토자 링크를 복사했습니다.");
  }

  return {
    reviewerName,
    setReviewerName,
    reviewerRole,
    setReviewerRole,
    issuedReviewerTokens,
    regenerateSharedLink,
    createReviewer,
    regenerateReviewerLink,
    setReviewerActive,
    setReviewerPermission,
    copyReviewerLink,
  };
}
