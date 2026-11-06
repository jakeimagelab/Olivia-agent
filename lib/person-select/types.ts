export type PersonSelectCategory = {
  key: string;
  label: string;
  pick: number;
};

export type PersonSelectProjectType = "general" | "school" | "medical" | "business";
export type PersonSelectAccessMode = "individual" | "project_shared";
export type PersonSelectCustomerViewMode = "classic" | "bridge";

export type PersonSelectRetouchOption = {
  key: string;
  label: string;
};

export type PersonSelectEvent = {
  id: string;
  slug: string;
  title: string;
  client_id: string | null;
  categories: PersonSelectCategory[];
  retouch_options: PersonSelectRetouchOption[];
  memo_max: number;
  deadline_at: string;
  status: "draft" | "open" | "closed";
  /** 프로젝트 성격, 로그인 단위, 고객 화면은 서로 독립된 설정이다. */
  project_type?: PersonSelectProjectType;
  access_mode?: PersonSelectAccessMode;
  customer_view_mode?: PersonSelectCustomerViewMode;
  shared_token?: string | null;
  shared_token_version?: number;
  shared_link_active?: boolean;
  shared_token_expires_at?: string | null;
  /** 사진을 가져온 Mac Studio 폴더. RAW 매칭이 같은 폴더에서 원본을 찾는다. */
  source_relative_path?: string | null;
  /** school: 선생님프로필/담임선생님 구조, person-folders: 이름 폴더/JPG원본 구조 */
  source_layout?: "school" | "person-folders" | "project";
  raw_match_result?: Record<string, unknown> | null;
  raw_matched_at?: string | null;
  /** 고객 화면 맨 위에 보이는 안내 문구 */
  offer_notice?: string;
  /** 기본 장수보다 더 고를 때 장당 가격(원). 0이면 추가로 고를 수 없다. */
  extra_price?: number;
  /** 항목마다 기본 장수 외에 더 고를 수 있는 최대 장수 */
  extra_max?: number;
  /** 고객이 신청할 수 있는 상품 (액자·앨범 등) */
  offers?: PersonSelectOffer[];
  created_at?: string;
  updated_at?: string;
};

export type PersonSelectOfferOption = { key: string; label: string; price: number };

export type PersonSelectOffer = {
  key: string;
  label: string;
  /** 수량 단위 (개, 권 …) */
  unit: string;
  /** 크기 같은 선택지가 없을 때의 가격(원) */
  price: number;
  /** 고객에게 보이는 구성 설명 */
  note: string;
  /** 고른 사진 중 어느 사진으로 만들지 정해야 하는 상품 (액자 등) */
  needs_photo: boolean;
  /** 크기 같은 선택지. 있으면 선택지마다 가격을 쓴다. */
  options: PersonSelectOfferOption[];
};

export type PersonSelectOrderItem = {
  offer_key: string;
  option_key: string | null;
  image_id: string | null;
  qty: number;
};

export type PersonSelectPerson = {
  id: string;
  event_id: string;
  display_name: string;
  login_name: string;
  group_label: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  submitted_at: string | null;
  orders?: PersonSelectOrderItem[];
};

export type PersonSelectSession = {
  personId: string;
  eventId: string;
  expiresAt: number;
};

export const DEFAULT_PERSON_SELECT_CATEGORIES: PersonSelectCategory[] = [
  { key: "profile", label: "선생님 프로필", pick: 1 },
  { key: "homeroom", label: "담임 사진", pick: 1 },
];

/** 새 일반 프로젝트는 학교·특정 행사의 문구를 물려받지 않는다. */
export const GENERAL_PERSON_SELECT_CATEGORIES: PersonSelectCategory[] = [
  { key: "photo", label: "사진", pick: 1 },
];

export const PERSON_SELECT_CATEGORY_RECOMMENDATIONS: Record<PersonSelectProjectType, PersonSelectCategory[]> = {
  general: GENERAL_PERSON_SELECT_CATEGORIES,
  school: DEFAULT_PERSON_SELECT_CATEGORIES,
  medical: [
    { key: "profile", label: "프로필", pick: 1 },
    { key: "staged", label: "진료 연출", pick: 1 },
    { key: "group", label: "단체사진", pick: 1 },
  ],
  business: [
    { key: "profile", label: "프로필", pick: 1 },
    { key: "group", label: "단체사진", pick: 1 },
  ],
};

/** 프로젝트 생성 시 추천값을 복사해 다른 프로젝트와 배열 참조를 공유하지 않는다. */
export function categoriesForProjectType(projectType: PersonSelectProjectType): PersonSelectCategory[] {
  return PERSON_SELECT_CATEGORY_RECOMMENDATIONS[projectType].map((category) => ({ ...category }));
}

export function isPersonSelectProjectType(value: unknown): value is PersonSelectProjectType {
  return value === "general" || value === "school" || value === "medical" || value === "business";
}

export function isPersonSelectAccessMode(value: unknown): value is PersonSelectAccessMode {
  return value === "individual" || value === "project_shared";
}

export function isPersonSelectCustomerViewMode(value: unknown): value is PersonSelectCustomerViewMode {
  return value === "classic" || value === "bridge";
}

/** 이름 폴더 구조로 가져온 사진이 들어가는 항목. 수량은 관리자 화면에서 바꾼다. */
export const PERSON_FOLDER_CATEGORY: PersonSelectCategory = { key: "photo", label: "사진", pick: 1 };

/** 한 항목에서 고를 수 있는 최대 장수 */
export const PERSON_SELECT_MAX_PICK = 50;

export const DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS: PersonSelectRetouchOption[] = [
  { key: "natural", label: "최소 보정 (자연스럽게)" },
  { key: "skin", label: "피부톤 정돈" },
  { key: "blemish", label: "잡티·점 정리" },
  { key: "undereye", label: "다크서클 완화" },
  { key: "wrinkle", label: "주름 부드럽게" },
  { key: "hair", label: "잔머리 정리" },
  { key: "clothes", label: "옷 구김 정리" },
  { key: "glasses", label: "안경 반사 제거" },
  { key: "face", label: "얼굴선 다듬기" },
];

export const PERSON_SELECT_ORDER_MAX_QTY = 20;

export const DEFAULT_PERSON_SELECT_NOTICE = "한 분당 보정본 1장 드립니다.\n추가로 원하시면 사진을 더 선택하시거나\n아래에서 액자/앨범을 신청해주세요.";
export const DEFAULT_PERSON_SELECT_EXTRA_PRICE = 50_000;
export const DEFAULT_PERSON_SELECT_EXTRA_MAX = 10;

/** 특정 행사 템플릿을 적용하지 않은 새 프로젝트의 중립 상품 설정. */
export const NEUTRAL_PERSON_SELECT_NOTICE = "";
export const NEUTRAL_PERSON_SELECT_EXTRA_PRICE = 0;
export const NEUTRAL_PERSON_SELECT_EXTRA_MAX = 0;
export const NEUTRAL_PERSON_SELECT_OFFERS: PersonSelectOffer[] = [];
/**
 * 추가 주문 상품 예시 사진 (public/person-select/offers).
 * 상품 구분값(offer_key)과 선택지(option_keys)로 찾는다. option_keys가 null이면 그 상품 전체에 쓴다.
 */
export type PersonSelectOfferImage = { offer_key: string; option_keys: string[] | null; src: string; caption: string };
export const PERSON_SELECT_OFFER_IMAGES: PersonSelectOfferImage[] = [
  { offer_key: "frame", option_keys: ["6r"], src: "/person-select/offers/frame-6r.jpg", caption: "6R (6x8inch) 아크릴 액자" },
  { offer_key: "frame", option_keys: ["16r", "20r"], src: "/person-select/offers/frame-16r-20r.jpg", caption: "16R · 20R 액자" },
  { offer_key: "album", option_keys: null, src: "/person-select/offers/album.jpg", caption: "앨범 미리보기" },
];

/** 상품에 보여줄 예시 사진들. 상품에 있는 선택지와 맞는 사진만 고른다. */
export function offerImagesFor(offer: { key: string; options: { key: string }[] }) {
  const optionKeys = new Set(offer.options.map((option) => option.key));
  return PERSON_SELECT_OFFER_IMAGES.filter((image) => image.offer_key === offer.key && (!image.option_keys || image.option_keys.some((key) => optionKeys.has(key))));
}

export const DEFAULT_PERSON_SELECT_OFFERS: PersonSelectOffer[] = [
  { key: "frame", label: "액자 제작", unit: "개", price: 0, note: "", needs_photo: true, options: [
    { key: "6r", label: "6R (6x8inch)", price: 30_000 },
    { key: "16r", label: "16R (16x20inch)", price: 100_000 },
    { key: "20r", label: "20R (20x24inch)", price: 150_000 },
  ] },
  { key: "album", label: "앨범 제작", unit: "권", price: 200_000, note: "20페이지 · 블랙가죽 · 벨라비타 금장로고\n· 프로필(스튜디오촬영본)\n· 11기 공연 정보\n· 졸업공연 개인사진 20컷\n· 입학식\n· 졸업여행\n· 졸업공연 단체사진 및 교수진 사진", needs_photo: false, options: [] },
];
