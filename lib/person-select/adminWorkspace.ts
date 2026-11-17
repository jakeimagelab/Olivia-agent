export type PersonSelectAdminStatus =
  | "selecting"
  | "submitted"
  | "retouch_pending"
  | "approval_pending"
  | "revision_requested"
  | "approved";

export type PersonSelectCustomerStageNumber = 1 | 2 | 3;

export type PersonSelectWorkspaceDelivery = {
  id: string;
  linked_image_id?: string | null;
  current_version: number;
  status: "pending" | "revision_requested" | "revised" | "approved";
  updated_at?: string | null;
};

export type PersonSelectWorkspaceImage = {
  id: string;
  original_file_name: string;
  source_rel_path: string;
};

export function togglePersonSelectRetouchKey(keys: readonly string[], key: string) {
  return keys.includes(key) ? keys.filter((current) => current !== key) : [...keys, key];
}

export function resolvePersonSelectAdminStatus(input: {
  submittedAt?: string | null;
  rawMatched?: boolean;
  deliveryState?: string | null;
  deliveries?: readonly Pick<PersonSelectWorkspaceDelivery, "status">[];
}): PersonSelectAdminStatus {
  const deliveries = input.deliveries ?? [];
  if (input.deliveryState === "approved") return "approved";
  if (deliveries.some((delivery) => delivery.status === "revision_requested")) return "revision_requested";
  if (deliveries.length > 0) return "approval_pending";
  if (input.submittedAt && input.rawMatched) return "retouch_pending";
  if (input.submittedAt) return "submitted";
  return "selecting";
}

export function resolvePersonSelectCustomerStage(input: {
  submittedAt?: string | null;
  deliveryState?: string | null;
  deliveries?: readonly Pick<PersonSelectWorkspaceDelivery, "status">[];
}): PersonSelectCustomerStageNumber {
  const deliveries = input.deliveries ?? [];
  const allApproved = deliveries.length > 0
    && deliveries.every((delivery) => delivery.status === "approved");
  if (input.deliveryState === "approved" && allApproved) return 3;
  if (input.submittedAt || deliveries.length > 0) return 2;
  return 1;
}

export type PersonSelectDeliverySlot<TImage extends PersonSelectWorkspaceImage, TDelivery extends PersonSelectWorkspaceDelivery> = {
  image: TImage;
  delivery: TDelivery | null;
};

export function pairSelectedImagesWithDeliveries<
  TImage extends PersonSelectWorkspaceImage,
  TDelivery extends PersonSelectWorkspaceDelivery,
>(selectedImages: readonly TImage[], deliveries: readonly TDelivery[]) {
  const byImage = new Map<string, TDelivery>();
  const unlinked: TDelivery[] = [];

  for (const delivery of deliveries) {
    const imageId = delivery.linked_image_id ?? null;
    if (!imageId) {
      unlinked.push(delivery);
      continue;
    }
    const current = byImage.get(imageId);
    if (!current || compareDeliveryRecency(delivery, current) > 0) byImage.set(imageId, delivery);
  }

  const selectedIds = new Set(selectedImages.map((image) => image.id));
  for (const delivery of deliveries) {
    if (delivery.linked_image_id && !selectedIds.has(delivery.linked_image_id)) unlinked.push(delivery);
  }

  return {
    slots: selectedImages.map((image): PersonSelectDeliverySlot<TImage, TDelivery> => ({
      image,
      delivery: byImage.get(image.id) ?? null,
    })),
    unlinked: dedupeDeliveries(unlinked),
  };
}

function compareDeliveryRecency(left: PersonSelectWorkspaceDelivery, right: PersonSelectWorkspaceDelivery) {
  if (left.current_version !== right.current_version) return left.current_version - right.current_version;
  return String(left.updated_at ?? "").localeCompare(String(right.updated_at ?? ""));
}

function dedupeDeliveries<TDelivery extends PersonSelectWorkspaceDelivery>(deliveries: readonly TDelivery[]) {
  const seen = new Set<string>();
  return deliveries.filter((delivery) => {
    if (seen.has(delivery.id)) return false;
    seen.add(delivery.id);
    return true;
  });
}

export const PERSON_SELECT_ADMIN_STATUS_LABELS: Record<PersonSelectAdminStatus, string> = {
  selecting: "선택 중",
  submitted: "제출",
  retouch_pending: "보정 대기",
  approval_pending: "확정 대기",
  revision_requested: "수정 요청",
  approved: "고객 확정",
};

