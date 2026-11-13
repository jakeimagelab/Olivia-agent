"use client";

import { useCallback, useEffect, useState } from "react";

import { useVisibleSelectionRefresh } from "@/components/person-select/useVisibleSelectionRefresh";
import type { CustomerBridgeDraft } from "@/lib/select-gallery/customerBridgeTypes";
import { isRetryableApiError, readApiResponse } from "@/lib/http/apiResponse";
import type {
  PersonSelectAdminData,
  PersonSelectSharedReviewer,
  PersonSelectSharedSelectionItem,
} from "@/lib/person-select/adminData";

const PERSON_SELECT_LOAD_RETRY_DELAYS_MS = [700, 1_500] as const;
const PERSON_SELECT_ADMIN_REFRESH_INTERVAL_MS = 30_000;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function usePersonSelectAdminData({
  eventId,
  onError,
}: {
  eventId: string;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<PersonSelectAdminData | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedReviewerId, setSelectedReviewerId] = useState<string | null>(null);

  const load = useCallback(async (options?: { preserveAssignments?: boolean }) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetch(`/api/person-select/${eventId}`, { cache: "no-store" });
        const body = await readApiResponse<PersonSelectAdminData & { ok: true }>(response, "사진선택");
        setData(body);
        if (!options?.preserveAssignments) {
          setAssignments(Object.fromEntries(body.groups.map((group) => [
            group.label,
            body.people.find((person) => person.group_label === group.label)?.id ?? "",
          ])));
        }
        return;
      } catch (cause) {
        if (!isRetryableApiError(cause) || attempt >= PERSON_SELECT_LOAD_RETRY_DELAYS_MS.length) throw cause;
        await wait(PERSON_SELECT_LOAD_RETRY_DELAYS_MS[attempt]);
      }
    }
  }, [eventId]);

  useEffect(() => {
    void load().catch((cause) => onError(cause instanceof Error ? cause.message : "사진선택 데이터를 불러오지 못했습니다."));
  }, [load, onError]);

  const refreshAdminData = useCallback(
    () => load({ preserveAssignments: true }),
    [load],
  );
  useVisibleSelectionRefresh({
    refresh: refreshAdminData,
    intervalMs: PERSON_SELECT_ADMIN_REFRESH_INTERVAL_MS,
  });

  useEffect(() => {
    const reviewers = data?.shared?.reviewers ?? [];
    if (!reviewers.length) {
      setSelectedReviewerId(null);
      return;
    }
    if (selectedReviewerId && reviewers.some((reviewer) => reviewer.id === selectedReviewerId)) return;
    setSelectedReviewerId((reviewers.find((reviewer) => !reviewer.is_legacy) ?? reviewers[0]).id);
  }, [data?.shared?.reviewers, selectedReviewerId]);

  const refreshSelectedReviewerDraft = useCallback(async () => {
    if (!selectedReviewerId) return;
    const response = await fetch(`/api/person-select/${eventId}/reviewers/${selectedReviewerId}/draft`, { cache: "no-store" });
    const body = await readApiResponse<{ ok: true; draft: CustomerBridgeDraft }>(response, "고객 셀렉 동기화");
    setData((current) => {
      if (!current?.shared) return current;
      const reviewer = current.shared.reviewers.find((item) => item.id === selectedReviewerId);
      if (!reviewer || reviewer.draft?.revision === body.draft?.revision) return current;
      const imagesById = new Map(current.shared.images.map((image) => [image.id, image]));
      const previousItems = new Map((reviewer.draft?.items ?? []).map((item) => [item.image_id, item]));
      const items: PersonSelectSharedSelectionItem[] = body.draft.selectedImageIds.map((imageId) => {
        const image = imagesById.get(imageId);
        const previous = previousItems.get(imageId);
        return {
          image_id: imageId,
          customer_rating: body.draft?.ratings[imageId] ?? null,
          customer_color_label: body.draft?.colorLabels?.[imageId] ?? null,
          memo: body.draft?.imageNotes[imageId] ?? "",
          image: image ? {
            original_file_name: image.original_file_name,
            source_rel_path: image.relative_path ?? "",
            thumb_url: previous?.image?.thumb_url ?? image.thumbnail_url ?? "",
          } : previous?.image ?? null,
        };
      });
      const updatedAt = body.draft.updatedAt ?? new Date().toISOString();
      const nextDraft: PersonSelectSharedReviewer["draft"] = {
        ...body.draft,
        selected_count: body.draft.selectedImageIds.length,
        updated_at: updatedAt,
        items,
      };
      return {
        ...current,
        shared: {
          ...current.shared,
          reviewers: current.shared.reviewers.map((item) => item.id === selectedReviewerId ? {
            ...item,
            draft: nextDraft,
            server_selected_count: body.draft?.selectedImageIds.length ?? 0,
            server_last_saved_at: body.draft?.updatedAt ?? null,
          } : item),
        },
      };
    });
  }, [eventId, selectedReviewerId]);

  useVisibleSelectionRefresh({
    enabled: Boolean(data?.event.access_mode === "project_shared" && selectedReviewerId),
    refresh: refreshSelectedReviewerDraft,
  });

  return {
    data,
    setData,
    load,
    assignments,
    setAssignments,
    selectedReviewerId,
    setSelectedReviewerId,
  };
}
