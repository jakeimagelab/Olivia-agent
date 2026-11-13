"use client";

import { PERSON_SELECT_IMAGE_PAGE_SIZE } from "@/lib/person-select/imagePaging";
import type { PersonSelectImageData } from "./usePersonChoiceSync";

export type PersonSelectImagePage = {
  images: PersonSelectImageData[];
  nextCursor: string | null;
};

const imageRequests = new Map<string, Promise<PersonSelectImagePage>>();
const previewRequests = new Map<string, Promise<PersonSelectImageData[]>>();

function requestScopeKey(slug: string, category: string) {
  return `${slug}:${category}`;
}

export function buildPersonSelectImagePageUrl(slug: string, category: string, cursor: string | null) {
  const params = new URLSearchParams({
    category,
    variant: "thumbnail",
    limit: String(PERSON_SELECT_IMAGE_PAGE_SIZE),
  });
  if (cursor) params.set("cursor", cursor);
  return `/api/pick/${slug}/images?${params.toString()}`;
}

export function buildPersonSelectPreviewUrl(slug: string, category: string, imageIds: readonly string[]) {
  const params = new URLSearchParams({ category, variant: "preview" });
  imageIds.forEach((imageId) => params.append("imageId", imageId));
  return `/api/pick/${slug}/images?${params.toString()}`;
}

export function clearPersonSelectImageRequestCache(slug: string) {
  for (const key of imageRequests.keys()) if (key.startsWith(`${slug}:`)) imageRequests.delete(key);
  for (const key of previewRequests.keys()) if (key.startsWith(`${slug}:`)) previewRequests.delete(key);
}

export async function fetchPersonSelectImagePage(slug: string, category: string, cursor: string | null) {
  const key = `${requestScopeKey(slug, category)}:${cursor ?? "first"}`;
  const pending = imageRequests.get(key);
  if (pending) return pending;
  const request = fetch(buildPersonSelectImagePageUrl(slug, category, cursor), { cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "사진을 불러오지 못했어요.");
      return {
        images: Array.isArray(data.images) ? data.images as PersonSelectImageData[] : [],
        nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
      };
    })
    .finally(() => imageRequests.delete(key));
  imageRequests.set(key, request);
  return request;
}

export async function fetchPersonSelectPreviewUrls(slug: string, category: string, imageIds: readonly string[]) {
  const uniqueIds = [...new Set(imageIds.filter(Boolean))].slice(0, 8);
  if (!uniqueIds.length) return [];
  const key = `${requestScopeKey(slug, category)}:${uniqueIds.slice().sort().join(",")}`;
  const pending = previewRequests.get(key);
  if (pending) return pending;
  const request = fetch(buildPersonSelectPreviewUrl(slug, category, uniqueIds), { cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "미리보기를 불러오지 못했어요.");
      return Array.isArray(data.images) ? data.images as PersonSelectImageData[] : [];
    })
    .finally(() => previewRequests.delete(key));
  previewRequests.set(key, request);
  return request;
}
