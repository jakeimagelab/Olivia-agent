"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  completedPersonSelectClientImagePageState,
  mergePersonSelectClientImages,
  personSelectClientImagePageUrl,
  personSelectClientImageQueryKey,
  type PersonSelectClientImagePage,
  type PersonSelectClientImagePageState,
  type PersonSelectClientImageQuery,
} from "@/lib/person-select/imagePageClient";
import { readSelectionJsonResponse } from "@/lib/person-select/selectionSyncClient";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";

const ALL_IMAGES_QUERY: PersonSelectClientImageQuery = { location: "all" };

function emptyPageState(): PersonSelectClientImagePageState {
  return { initialized: false, loading: false, nextCursor: null, totalCount: 0, error: "" };
}

export function useSharedPersonSelectImagePages({
  shareToken,
  initialImages,
  initialPage,
}: {
  shareToken: string;
  initialImages: readonly CustomerBridgeImage[];
  initialPage?: PersonSelectClientImagePage | null;
}) {
  const [images, setImages] = useState(() => mergePersonSelectClientImages([], initialImages));
  const [, setVersion] = useState(0);
  const mountedRef = useRef(true);
  const statesRef = useRef(new Map<string, PersonSelectClientImagePageState>([
    [personSelectClientImageQueryKey(ALL_IMAGES_QUERY), initialPage
      ? completedPersonSelectClientImagePageState(initialPage)
      : { ...emptyPageState(), initialized: true, totalCount: initialImages.length }],
  ]));
  const requestsRef = useRef(new Map<string, Promise<boolean>>());

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    setImages((current) => mergePersonSelectClientImages(current, initialImages));
  }, [initialImages]);

  const publishState = useCallback((key: string, state: PersonSelectClientImagePageState) => {
    statesRef.current.set(key, state);
    if (mountedRef.current) setVersion((value) => value + 1);
  }, []);

  const loadNext = useCallback((query: PersonSelectClientImageQuery) => {
    const key = personSelectClientImageQueryKey(query);
    const existingRequest = requestsRef.current.get(key);
    if (existingRequest) return existingRequest;
    const current = statesRef.current.get(key) ?? emptyPageState();
    if (current.initialized && !current.nextCursor) return Promise.resolve(false);

    publishState(key, { ...current, loading: true, error: "" });
    const request = fetch(personSelectClientImagePageUrl({
      baseUrl: `/api/pick/shared/${shareToken}/images`,
      query,
      cursor: current.initialized ? current.nextCursor : null,
    }), { cache: "no-store" })
      .then(async (response) => {
        const result = await readSelectionJsonResponse<{ ok?: boolean; page?: PersonSelectClientImagePage; error?: string }>(response);
        if (!response.ok || result?.ok !== true || !result.page) {
          throw new Error(result?.error || "사진 목록을 불러오지 못했습니다.");
        }
        if (mountedRef.current) setImages((existing) => mergePersonSelectClientImages(existing, result.page!.items));
        publishState(key, completedPersonSelectClientImagePageState(result.page));
        return true;
      })
      .catch((error) => {
        publishState(key, {
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "사진 목록을 불러오지 못했습니다.",
        });
        return false;
      })
      .finally(() => requestsRef.current.delete(key));
    requestsRef.current.set(key, request);
    return request;
  }, [publishState, shareToken]);

  const ensureQuery = useCallback((query: PersonSelectClientImageQuery) => {
    const state = statesRef.current.get(personSelectClientImageQueryKey(query));
    if (state?.initialized || state?.loading) return Promise.resolve(false);
    return loadNext(query);
  }, [loadNext]);

  const stateForQuery = useCallback((query: PersonSelectClientImageQuery) => (
    statesRef.current.get(personSelectClientImageQueryKey(query)) ?? emptyPageState()
  ), []);

  return { images, loadNext, ensureQuery, stateForQuery };
}
