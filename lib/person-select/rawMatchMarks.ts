import {
  normalizeCustomerColorLabel,
  normalizeCustomerRating,
} from "@/lib/person-select/customerSelection";
import {
  PERSON_SELECT_RAW_LABEL_NAMES,
  type PersonSelectRawImage,
  type PersonSelectRawLabelNames,
  type PersonSelectRawMatchMode,
  type PersonSelectRawMatchSource,
  type PersonSelectRawMatchTarget,
} from "@/lib/person-select/rawMatchTypes";

export function normalizePersonSelectRawMatchSource(value: unknown): PersonSelectRawMatchSource {
  return value === "current" ? "current" : "submitted";
}

export function normalizePersonSelectRawMatchMode(value: unknown): PersonSelectRawMatchMode {
  return value === "mark" ? "mark" : "copy";
}

export function normalizePersonSelectRawLabelNames(value: unknown): PersonSelectRawLabelNames {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(([6, 7, 8, 9] as const).map((label) => {
    const configured = record[String(label)];
    return [label, typeof configured === "string" && configured.trim()
      ? configured.trim().slice(0, 80)
      : PERSON_SELECT_RAW_LABEL_NAMES[label]];
  })) as PersonSelectRawLabelNames;
}

export function personSelectRawTargetFromImage(
  image: PersonSelectRawImage,
  ownerId: string,
  ownerName: string,
  binarySelection = false,
): PersonSelectRawMatchTarget {
  const customerColorLabel = normalizeCustomerColorLabel(image.customerColorLabel);
  const explicitRating = normalizeCustomerRating(image.customerRating);
  return {
    ...image,
    ownerId,
    ownerName,
    // 개인별/classic 셀렉은 별점 없이 "선택됨"만 저장한다. RAW 표시에서는
    // Adobe Bridge의 확정 셀렉 관례에 맞춰 ★5로 보이되, 컬러만 고른 사진에는
    // 임의의 별점을 더하지 않는다. 실제 고객 별점은 그대로 보존한다.
    customerRating: binarySelection
      ? (customerColorLabel === null ? 5 : null)
      : explicitRating ?? (customerColorLabel === null ? 5 : null),
    customerColorLabel,
    markSavedAt: image.markSavedAt ?? null,
    markConflict: false,
  };
}

export function uniquePersonSelectRawTargets(
  values: readonly PersonSelectRawMatchTarget[],
): PersonSelectRawMatchTarget[] {
  const byImageId = new Map<string, PersonSelectRawMatchTarget>();
  for (const value of values) {
    if (!value.id) continue;
    const previous = byImageId.get(value.id);
    if (!previous) {
      byImageId.set(value.id, value);
      continue;
    }
    const ratings = [previous.customerRating, value.customerRating]
      .filter((rating): rating is number => rating !== null);
    const previousColorAt = previous.markSavedAt ? Date.parse(previous.markSavedAt) : 0;
    const nextColorAt = value.markSavedAt ? Date.parse(value.markSavedAt) : 0;
    const colorFromValue = value.customerColorLabel !== null && nextColorAt >= previousColorAt;
    byImageId.set(value.id, {
      ...previous,
      customerRating: ratings.length ? Math.max(...ratings) : null,
      customerColorLabel: colorFromValue ? value.customerColorLabel : previous.customerColorLabel,
      markSavedAt: colorFromValue ? value.markSavedAt : previous.markSavedAt,
      markConflict: previous.markConflict
        || (previous.customerRating !== null && value.customerRating !== null && previous.customerRating !== value.customerRating)
        || (previous.customerColorLabel !== null && value.customerColorLabel !== null && previous.customerColorLabel !== value.customerColorLabel),
    });
  }
  return [...byImageId.values()];
}
