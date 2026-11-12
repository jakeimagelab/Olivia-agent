import { PERSON_SELECT_MAX_PICK, PERSON_SELECT_ORDER_MAX_QTY, type PersonSelectCategory, type PersonSelectOffer, type PersonSelectOrderItem } from "./types";
import { isSelectionSubmissionLocked, validateSelectionMemo } from "@/lib/select-core";
export { formatWon } from "./format";
export {
  classifyPersonFolderName,
  derivePersonLoginName,
  normalizeLoginName,
  normalizeNfc,
  parseGroupFolderName,
  parsePersonFolderName,
  PERSON_FOLDER_JPG_DIRECTORIES,
  type PersonFolderKind,
} from "./folderRules";

export function isLoginRateLimited(failedAttempts: number) {
  return failedAttempts >= 10;
}

export function canAccessImageRecord(input: {
  personId: string;
  groupLabel: string | null;
  categoryKey: string;
  imageOwnerPersonId: string | null;
  imageOwnerGroup: string | null;
}) {
  if (input.categoryKey === "homeroom") return Boolean(input.groupLabel && input.imageOwnerGroup === input.groupLabel);
  return input.imageOwnerPersonId === input.personId;
}

export function eventIsLocked(event: { status: string; deadline_at: string }, now = new Date()) {
  return isSelectionSubmissionLocked({ status: event.status, deadlineAt: event.deadline_at, now });
}

export function requiredCategoryKeys(input: {
  categories: PersonSelectCategory[];
  groupLabel: string | null;
  imageCounts: Record<string, number>;
}) {
  return input.categories
    .filter((category) => category.pick > 0)
    .filter((category) => (input.imageCounts[category.key] ?? 0) > 0)
    .filter((category) => category.key !== "homeroom" || Boolean(input.groupLabel))
    .map((category) => category.key);
}

export function selectionStatus(input: {
  firstSeenAt: string | null;
  submittedAt: string | null;
  choiceCount: number;
  latestChoiceAt: string | null;
}) {
  if (!input.firstSeenAt) return "미접속";
  if (!input.submittedAt) return input.choiceCount > 0 ? "저장 중" : "미접속";
  if (input.latestChoiceAt && new Date(input.latestChoiceAt) > new Date(input.submittedAt)) return "제출 후 수정됨";
  return "제출 완료";
}

export function validateChoiceInput(input: {
  retouchKeys: unknown;
  memo: unknown;
  allowedKeys: string[];
  memoMax: number;
}) {
  if (!Array.isArray(input.retouchKeys) || input.retouchKeys.some((key) => typeof key !== "string" || !input.allowedKeys.includes(key))) {
    return "행사에 없는 보정 요청입니다.";
  }
  return validateSelectionMemo(input.memo, input.memoMax);
}

/** 고객이 실제로 골라야 하는 장수. 올라온 사진이 정한 수량보다 적으면 있는 만큼만 고른다. */
export function requiredPickCount(pick: number, imageCount: number) {
  const value = Number.isFinite(pick) ? Math.max(0, Math.floor(pick)) : 0;
  return Math.min(value, Math.max(0, imageCount));
}

/** 한 항목에서 고를 수 있는 최대 장수 (기본 장수 + 추가로 고를 수 있는 장수) */
export function pickLimit(pick: number, extraMax = 0) {
  return Math.max(1, Math.floor(Number(pick) || 1)) + Math.max(0, Math.floor(Number(extraMax) || 0));
}

/** 제출할 때 수량이 맞지 않는 첫 항목을 돌려준다. 모두 맞으면 null */
export function findPickShortage(input: {
  categories: PersonSelectCategory[];
  groupLabel: string | null;
  imageCounts: Record<string, number>;
  chosenCounts: Record<string, number>;
  extraMax?: number;
}) {
  for (const key of requiredCategoryKeys(input)) {
    const category = input.categories.find((item) => item.key === key)!;
    const imageCount = input.imageCounts[key] ?? 0;
    const need = requiredPickCount(category.pick, imageCount);
    const max = Math.min(imageCount, pickLimit(category.pick, input.extraMax));
    const have = input.chosenCounts[key] ?? 0;
    if (have < need) return { key, label: category.label, need, have };
    if (have > max) return { key, label: category.label, need: max, have };
  }
  return null;
}

export function pickShortageMessage(shortage: { label: string; need: number; have: number }) {
  if (shortage.have > shortage.need) return `${shortage.label}은 ${shortage.need}장까지 고를 수 있어요. (지금 ${shortage.have}장)`;
  return `${shortage.label}을 ${shortage.need}장 골라주세요. (지금 ${shortage.have}장)`;
}

/** 추가 보정 가격이 있을 때만 기본 장수보다 더 고를 수 있다. */
export function effectiveExtraMax(event: { extra_price?: number | null; extra_max?: number | null }) {
  return Number(event.extra_price) > 0 ? Math.max(0, Math.floor(Number(event.extra_max) || 0)) : 0;
}

/** 기본 장수를 넘겨 고른 장수의 합 (추가 보정 장수) */
export function extraPickCount(categories: PersonSelectCategory[], chosenCounts: Record<string, number>) {
  return categories.reduce((sum, category) => sum + Math.max(0, (chosenCounts[category.key] ?? 0) - Math.max(1, Math.floor(Number(category.pick) || 1))), 0);
}

/** 관리자 화면에서 바꾼 항목 수량을 확인한다. 문제가 있으면 안내 문구를 돌려준다. */
export function validateCategoryPicks(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "사진 항목이 필요합니다.";
  for (const item of value) {
    if (!item || typeof item !== "object") return "사진 항목 형식이 올바르지 않습니다.";
    const category = item as Record<string, unknown>;
    if (typeof category.key !== "string" || !category.key || typeof category.label !== "string") return "사진 항목 형식이 올바르지 않습니다.";
    if (!Number.isInteger(category.pick) || Number(category.pick) < 1 || Number(category.pick) > PERSON_SELECT_MAX_PICK) {
      return `수량은 1장부터 ${PERSON_SELECT_MAX_PICK}장까지 정할 수 있습니다.`;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validPrice(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100_000_000;
}

/** 관리자 화면에서 저장하는 상품 목록을 확인한다. 문제가 있으면 안내 문구를 돌려준다. */
export function validateOffers(value: unknown) {
  if (!Array.isArray(value)) return "상품 목록 형식이 올바르지 않습니다.";
  if (value.length > 20) return "상품은 20개까지 등록할 수 있습니다.";
  const keys = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return "상품 형식이 올바르지 않습니다.";
    if (typeof item.key !== "string" || !item.key || keys.has(item.key)) return "상품 구분값이 비었거나 겹칩니다.";
    keys.add(item.key);
    if (typeof item.label !== "string" || !item.label.trim()) return "상품 이름을 입력해 주세요.";
    if (typeof item.unit !== "string" || typeof item.note !== "string" || typeof item.needs_photo !== "boolean") return `${item.label}의 형식이 올바르지 않습니다.`;
    if (!validPrice(item.price)) return `${item.label}의 가격을 원 단위 숫자로 입력해 주세요.`;
    if (!Array.isArray(item.options)) return `${item.label}의 선택지 형식이 올바르지 않습니다.`;
    const optionKeys = new Set<string>();
    for (const option of item.options) {
      if (!isRecord(option) || typeof option.key !== "string" || !option.key || optionKeys.has(option.key) || typeof option.label !== "string" || !option.label.trim()) return `${item.label}의 선택지 이름을 확인해 주세요.`;
      optionKeys.add(option.key);
      if (!validPrice(option.price)) return `${item.label} · ${option.label}의 가격을 원 단위 숫자로 입력해 주세요.`;
    }
    if (!item.options.length && Number(item.price) <= 0) return `${item.label}의 가격을 입력해 주세요.`;
  }
  return null;
}

export type PricedOrderLine = { label: string; detail: string; unitPrice: number; qty: number; amount: number };

/**
 * 추가 주문 금액을 계산한다. 추가 보정은 기본 장수를 넘겨 고른 장수로 자동 계산한다.
 * 상품 목록에 없는 주문(관리자가 나중에 지운 상품)은 금액 없이 "확인 필요"로 남긴다.
 */
export function priceOrder(input: {
  offers: PersonSelectOffer[];
  items: PersonSelectOrderItem[];
  extraCount: number;
  extraPrice: number;
  photoNames?: Record<string, string>;
}) {
  const lines: PricedOrderLine[] = [];
  if (input.extraCount > 0 && input.extraPrice > 0) {
    lines.push({ label: "추가 보정", detail: `기본 외 ${input.extraCount}장`, unitPrice: input.extraPrice, qty: input.extraCount, amount: input.extraCount * input.extraPrice });
  }
  for (const item of input.items) {
    const offer = input.offers.find((entry) => entry.key === item.offer_key);
    const option = offer?.options.find((entry) => entry.key === item.option_key);
    const photo = item.image_id ? input.photoNames?.[item.image_id] ?? "사진 확인 필요" : "";
    if (!offer || (offer.options.length && !option)) {
      lines.push({ label: offer?.label ?? "삭제된 상품", detail: "상품 목록에서 빠졌습니다 · 확인 필요", unitPrice: 0, qty: item.qty, amount: 0 });
      continue;
    }
    const unitPrice = option ? option.price : offer.price;
    lines.push({ label: offer.label, detail: [option?.label, photo].filter(Boolean).join(" · "), unitPrice, qty: item.qty, amount: unitPrice * item.qty });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}

/** 고객이 저장하는 주문을 확인한다. 문제가 있으면 안내 문구를 돌려준다. */
export function validateOrderItems(value: unknown, offers: PersonSelectOffer[], chosenImageIds: Set<string>) {
  if (!Array.isArray(value)) return { error: "주문 형식이 올바르지 않습니다." } as const;
  if (value.length > 50) return { error: "주문은 50줄까지 담을 수 있어요." } as const;
  const items: PersonSelectOrderItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return { error: "주문 형식이 올바르지 않습니다." } as const;
    const offer = offers.find((entry) => entry.key === raw.offer_key);
    if (!offer) return { error: "지금은 신청할 수 없는 상품이 있어요." } as const;
    const optionKey = typeof raw.option_key === "string" && raw.option_key ? raw.option_key : null;
    if (offer.options.length && !offer.options.some((option) => option.key === optionKey)) return { error: `${offer.label}의 크기를 골라주세요.` } as const;
    const imageId = typeof raw.image_id === "string" && raw.image_id ? raw.image_id : null;
    if (offer.needs_photo && (!imageId || !chosenImageIds.has(imageId))) return { error: `${offer.label}에 넣을 사진을 고른 사진 중에서 정해주세요.` } as const;
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > PERSON_SELECT_ORDER_MAX_QTY) return { error: `수량은 1개부터 ${PERSON_SELECT_ORDER_MAX_QTY}개까지예요.` } as const;
    items.push({ offer_key: offer.key, option_key: offer.options.length ? optionKey : null, image_id: offer.needs_photo ? imageId : null, qty });
  }
  return { items } as const;
}
