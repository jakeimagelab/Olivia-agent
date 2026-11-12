"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PersonSelectClientImagePageState,
  PersonSelectClientImageQuery,
} from "@/lib/person-select/imagePageClient";
import type { CustomerBridgeLocation } from "./useCustomerBridgeLocation";

const IMAGE_SEARCH_DEBOUNCE_MS = 250;

export function customerBridgeImagePageQuery(
  location: CustomerBridgeLocation,
  search: string,
): PersonSelectClientImageQuery {
  return {
    location: location.kind === "folder" ? "folder" : "all",
    ...(location.kind === "folder" ? { folderPath: location.path } : {}),
    ...(search.trim() ? { search } : {}),
  };
}

export function useCustomerBridgeImagePaging({
  location,
  filenameSearch,
  loadNextImagePage,
  ensureImagePage,
  getImagePageState,
}: {
  location: CustomerBridgeLocation;
  filenameSearch: string;
  loadNextImagePage?: (query: PersonSelectClientImageQuery) => Promise<boolean>;
  ensureImagePage?: (query: PersonSelectClientImageQuery) => Promise<boolean>;
  getImagePageState?: (query: PersonSelectClientImageQuery) => PersonSelectClientImagePageState;
}) {
  const [debouncedSearch, setDebouncedSearch] = useState(filenameSearch);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filenameSearch), IMAGE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filenameSearch]);

  const query = useMemo(
    () => customerBridgeImagePageQuery(location, debouncedSearch),
    [debouncedSearch, location],
  );
  const state = getImagePageState?.(query) ?? null;

  useEffect(() => {
    if (location.kind === "root" || !ensureImagePage) return;
    void ensureImagePage(query);
  }, [ensureImagePage, location.kind, query]);

  const requestNext = useCallback(() => {
    if (location.kind === "root" || !loadNextImagePage || state?.loading) return;
    if (state?.initialized && !state.nextCursor) return;
    void loadNextImagePage(query);
  }, [loadNextImagePage, location.kind, query, state]);

  return { query, state, requestNext };
}
