import type { PersonSelectChoice } from "./usePersonChoiceSync";

export const PERSON_SELECT_FIRST_PHOTO_TIMER_KEY = "person-select-login-started-at";

export type PersonSelectCategoryData = {
  key: string;
  label: string;
  pick: number;
  image_count: number;
  need: number;
  max: number;
  choices: PersonSelectChoice[];
};

export type PersonSelectEventData = {
  title: string;
  slug: string;
  deadline_at: string;
  status: string;
  source_layout?: "school" | "person-folders" | null;
  customer_stage?: "select" | "delivery";
  delivery_retention_days?: number;
  retouch_options: { key: string; label: string }[];
  memo_max: number;
  locked: boolean;
  offer_notice?: string;
  extra_price?: number;
  extra_max?: number;
  offers?: PersonSelectOffer[];
};

export type PersonSelectOffer = {
  key: string;
  label: string;
  unit: string;
  price: number;
  note: string;
  needs_photo: boolean;
  options: { key: string; label: string; price: number }[];
};

export type PersonSelectOrderItem = {
  offer_key: string;
  option_key: string | null;
  image_id: string | null;
  qty: number;
};

export type PersonSelectOrderLine = {
  label: string;
  detail: string;
  unitPrice: number;
  qty: number;
  amount: number;
};

export type PersonSelectMeData = {
  event: PersonSelectEventData;
  person: {
    display_name: string;
    group_label: string | null;
    submitted_at: string | null;
    delivery_state?: string;
  };
  categories: PersonSelectCategoryData[];
  order?: {
    items: PersonSelectOrderItem[];
    lines: PersonSelectOrderLine[];
    total: number;
  };
};

export type PersonSelectPublicEvent = Pick<PersonSelectEventData, "title" | "slug" | "deadline_at" | "status" | "source_layout">;

export function isSchoolPersonSelectEvent(event: { source_layout?: string | null } | null | undefined) {
  return !event?.source_layout || event.source_layout === "school";
}

export function isPersonSelectCategoryComplete(category: PersonSelectCategoryData) {
  return category.choices.length >= category.need
    && category.choices.length <= Math.max(category.need, category.max ?? category.need);
}

export function formatPersonSelectWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function personSelectExtraCount(category: PersonSelectCategoryData) {
  return Math.max(0, category.choices.length - Math.max(1, category.pick));
}

export function personSelectRetouchCount(category: PersonSelectCategoryData) {
  return category.choices.reduce((sum, choice) => sum + choice.retouch_keys.length, 0);
}

export function personSelectNeedMessage(category: PersonSelectCategoryData) {
  if (category.choices.length > Math.max(category.need, category.max ?? category.need)) {
    return `${category.label}은 ${category.max}장까지 고를 수 있어요.`;
  }
  return `${category.label}을 ${category.need}장 골라주세요.`;
}

export function shortPersonSelectFileName(value: string) {
  return value.length > 34 ? `…${value.slice(-32)}` : value;
}

export function personSelectFinalReviewData(categories: readonly PersonSelectCategoryData[]) {
  const selectedCategories = categories.filter((category) => category.choices.length > 0);
  return {
    selectedCount: selectedCategories.reduce((sum, category) => sum + category.choices.length, 0),
    sections: selectedCategories.map((category) => {
      const retouchCount = personSelectRetouchCount(category);
      return {
        label: category.label,
        count: category.choices.length,
        detail: category.choices.some((choice) => choice.memo || choice.retouch_keys.length)
          ? `보정 요청 ${retouchCount}개${category.choices.some((choice) => choice.memo) ? " · 메모 있음" : ""}`
          : "보정 요청 없음",
      };
    }),
    items: selectedCategories.flatMap((category) => category.choices.map((choice) => ({
      id: choice.image_id,
      fileName: choice.original_file_name,
      thumbnailUrl: choice.thumb_url,
      detail: `${category.label}${choice.retouch_keys.length ? ` · 보정 ${choice.retouch_keys.length}개` : ""}${choice.memo ? " · 메모 있음" : ""}`,
    }))).slice(0, 12),
  };
}
