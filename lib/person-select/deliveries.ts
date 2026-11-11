export const PERSON_SELECT_DELIVERY_STATUSES = ["pending", "revision_requested", "revised", "approved"] as const;
export const PERSON_SELECT_DELIVERY_STATES = ["none", "reviewing", "revision_sent", "approved"] as const;

export type PersonSelectCustomerStage = "select" | "delivery";
export type PersonSelectDeliveryStatus = typeof PERSON_SELECT_DELIVERY_STATUSES[number];
export type PersonSelectDeliveryState = typeof PERSON_SELECT_DELIVERY_STATES[number];
export type PersonSelectDeliveryLinkMethod = "exif" | "filename" | "folder" | "manual";

export type DeliveryLinkPerson = { id: string; displayName: string };
export type DeliverySelectedImage = { id: string; personId: string | null; captureTimeMs: number | null };
export type DeliveryLinkInput = {
  fileName: string;
  parentFolderName?: string | null;
  captureTimeMs?: number | null;
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
