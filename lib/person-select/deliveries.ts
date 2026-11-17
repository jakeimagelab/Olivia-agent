export const PERSON_SELECT_DELIVERY_STATUSES = ["pending", "revision_requested", "revised", "approved"] as const;
export const PERSON_SELECT_DELIVERY_STATES = ["none", "reviewing", "revision_sent", "approved"] as const;

export type PersonSelectCustomerStage = "select" | "delivery";
export type PersonSelectDeliveryStatus = typeof PERSON_SELECT_DELIVERY_STATUSES[number];
export type PersonSelectDeliveryState = typeof PERSON_SELECT_DELIVERY_STATES[number];
export type PersonSelectDeliveryLinkMethod = "exif" | "filename" | "folder" | "manual";
export type PersonSelectDeliveryDownloadMode = "storage" | "nas";

export const PERSON_SELECT_DIRECT_DELIVERY_LIMIT = 50;

export function resolvePersonSelectDeliveryDownloadMode(photoCount: number): PersonSelectDeliveryDownloadMode {
  return photoCount > PERSON_SELECT_DIRECT_DELIVERY_LIMIT ? "nas" : "storage";
}

export function personSelectDeliveryBundleKey(accessMode: string, personId: string | null | undefined) {
  if (accessMode === "project_shared") return "shared";
  return personId ? `person:${personId}` : "unassigned";
}

export type DeliveryLinkPerson = { id: string; displayName: string };
export type DeliverySelectedImage = {
  id: string;
  personId: string | null;
  captureTimeMs: number | null;
  /** 고객이 선택한 원본의 파일명. 원본 폴더가 이동돼도 보정본을 연결하는 안전한 폴백이다. */
  fileName?: string | null;
};
export type DeliveryLinkInput = {
  fileName: string;
  parentFolderName?: string | null;
  captureTimeMs?: number | null;
};

export type DeliverySourceVersionSnapshot = {
  sourceVirtualPath: string | null | undefined;
  size: number | string | null | undefined;
  uploadedAt: string | null | undefined;
};

export function normalizeDeliveryPersonName(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/님$/u, "")
    .toLocaleLowerCase("ko-KR");
}

export function normalizeDeliveryFileName(value: string) {
  return value.normalize("NFC").trim().toLocaleLowerCase("ko-KR");
}

export function deliveryNamePrefix(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/u, "");
  return withoutExtension.split(/[_-]/u, 1)[0] ?? withoutExtension;
}

/**
 * 포토샵·Evoto가 붙인 전달용 접미사를 제거하고 촬영 파일명을 비교 가능한 키로 만든다.
 * 사람/폴더 접두사가 붙은 원본 이름은 `endsWith`로 비교하되, 반드시 프로젝트 안에서
 * 정확히 한 장만 일치할 때만 사용한다.
 */
export function deliveryCaptureFileKey(fileName: string) {
  const baseName = fileName.replace(/^.*[\\/]/u, "").replace(/\.[^.]+$/u, "");
  return baseName
    .replace(/(?:[-_\s]+EVT)$/iu, "")
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * 같은 원본을 다시 선택한 경우 새 버전을 만들지 않는다.
 * 업로드 뒤 파일 수정시각이 바뀌었거나 크기·가상 경로가 달라졌을 때만 새 버전으로 본다.
 */
export function isUnchangedDeliverySource(input: {
  sourceVirtualPath: string;
  size: number;
  modifiedAtMs: number;
  previous: DeliverySourceVersionSnapshot | null | undefined;
}) {
  if (!input.previous?.sourceVirtualPath || !input.previous.uploadedAt) return false;
  const previousSize = Number(input.previous.size);
  const uploadedAtMs = new Date(input.previous.uploadedAt).getTime();
  if (!Number.isFinite(previousSize) || !Number.isFinite(uploadedAtMs)) return false;
  return input.previous.sourceVirtualPath.normalize("NFC") === input.sourceVirtualPath.normalize("NFC")
    && previousSize === input.size
    && input.modifiedAtMs <= uploadedAtMs + 2_000;
}

/** EXIF → 파일명 앞 이름 → 상위 폴더 순서로 한 사람을 안전하게 연결한다. */
export function resolveDeliveryOwner(
  input: DeliveryLinkInput,
  people: readonly DeliveryLinkPerson[],
  selectedImages: readonly DeliverySelectedImage[],
): { personId: string | null; linkedImageId: string | null; method: PersonSelectDeliveryLinkMethod | null } {
  if (Number.isFinite(input.captureTimeMs)) {
    const matches = selectedImages.filter((image) => image.captureTimeMs !== null
      && Math.abs(Number(image.captureTimeMs) - Number(input.captureTimeMs)) <= 2_000);
    if (matches.length === 1) return { personId: matches[0].personId, linkedImageId: matches[0].id, method: "exif" };
  }

  const captureKey = deliveryCaptureFileKey(input.fileName);
  if (captureKey.length >= 4) {
    const matches = selectedImages.filter((image) => {
      const selectedKey = image.fileName ? deliveryCaptureFileKey(image.fileName) : "";
      return selectedKey === captureKey || selectedKey.endsWith(captureKey);
    });
    if (matches.length === 1) {
      return { personId: matches[0].personId, linkedImageId: matches[0].id, method: "filename" };
    }
  }

  const byName = new Map(people.map((person) => [normalizeDeliveryPersonName(person.displayName), person.id]));
  const fromFile = byName.get(normalizeDeliveryPersonName(deliveryNamePrefix(input.fileName)));
  if (fromFile) return { personId: fromFile, linkedImageId: null, method: "filename" };
  const fromFolder = input.parentFolderName
    ? byName.get(normalizeDeliveryPersonName(input.parentFolderName))
    : undefined;
  if (fromFolder) return { personId: fromFolder, linkedImageId: null, method: "folder" };
  return { personId: null, linkedImageId: null, method: null };
}

export function nextDeliveryStatus(previous: PersonSelectDeliveryStatus, uploadingNewVersion: boolean) {
  if (!uploadingNewVersion) return previous;
  return previous === "revision_requested" ? "revised" : previous;
}

export function canFinalizeDeliveries(statuses: readonly PersonSelectDeliveryStatus[]) {
  return statuses.length > 0 && statuses.every((status) => status === "approved");
}

export function deliveryExpiresAt(input: {
  approvedAt: string | null | undefined;
  retentionDays: number;
  extendedUntil?: string | null;
}) {
  if (!input.approvedAt) return null;
  const base = new Date(input.approvedAt).getTime() + Math.max(1, input.retentionDays) * 86_400_000;
  const extended = input.extendedUntil ? new Date(input.extendedUntil).getTime() : Number.NaN;
  return new Date(Number.isFinite(extended) ? Math.max(base, extended) : base).toISOString();
}

export function isDeliveryExpired(input: Parameters<typeof deliveryExpiresAt>[0], nowMs = Date.now()) {
  const expiresAt = deliveryExpiresAt(input);
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= nowMs);
}

export function selectExpiredDeliveryOwners<T extends {
  id: string;
  approvedAt: string | null;
  retentionDays: number;
  extendedUntil?: string | null;
  purgedAt?: string | null;
}>(owners: readonly T[], nowMs = Date.now()) {
  return owners.filter((owner) => !owner.purgedAt && isDeliveryExpired({
    approvedAt: owner.approvedAt,
    retentionDays: owner.retentionDays,
    extendedUntil: owner.extendedUntil,
  }, nowMs));
}
