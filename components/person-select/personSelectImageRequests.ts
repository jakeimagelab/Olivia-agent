"use client";

import { PERSON_SELECT_IMAGE_PAGE_SIZE } from "@/lib/person-select/imagePaging";
import type { PersonSelectImageData } from "./usePersonChoiceSync";

export type PersonSelectImagePage = {
  images: PersonSelectImageData[];
  nextCursor: string | null;
};

const imageRequests = new Map<string, Promise<PersonSelectImagePage>>();
const previewRequests = new Map<string, Promise<PersonSelectImageData | null>>();

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
  const scope = requestScopeKey(slug, category);
  const requestKey = (imageId: string) => `${scope}:${imageId}`;
  const missingIds = uniqueIds.filter((imageId) => !previewRequests.has(requestKey(imageId)));
  if (missingIds.length) {
    const batchRequest = fetch(buildPersonSelectPreviewUrl(slug, category, missingIds), { cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "미리보기를 불러오지 못했어요.");
      return Array.isArray(data.images) ? data.images as PersonSelectImageData[] : [];
    });
    for (const imageId of missingIds) {
      const key = requestKey(imageId);
      let request: Promise<PersonSelectImageData | null>;
      request = batchRequest
        .then((images) => images.find((image) => image.id === imageId) ?? null)
        .finally(() => {
          if (previewRequests.get(key) === request) previewRequests.delete(key);
        });
      previewRequests.set(key, request);
    }
  }
  const previews = await Promise.all(uniqueIds.map((imageId) => previewRequests.get(requestKey(imageId))!));
  return previews.filter((image): image is PersonSelectImageData => Boolean(image));
}
