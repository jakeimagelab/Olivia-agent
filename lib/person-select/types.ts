export type PersonSelectCategory = {
  key: string;
  label: string;
  pick: number;
};

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
  /** 사진을 가져온 Mac Studio 폴더. RAW 매칭이 같은 폴더에서 원본을 찾는다. */
  source_relative_path?: string | null;
  /** school: 선생님프로필/담임선생님 구조, person-folders: 이름 폴더/JPG원본 구조 */
  source_layout?: "school" | "person-folders";
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

export const DEFAULT_PERSON_SELECT_NOTICE = "한 분당 보정본 1장을 드립니다. 더 원하시면 사진을 추가로 고르시거나 아래에서 액자·앨범을 신청해 주세요.";
export const DEFAULT_PERSON_SELECT_EXTRA_PRICE = 50_000;
export const DEFAULT_PERSON_SELECT_EXTRA_MAX = 10;
export const DEFAULT_PERSON_SELECT_OFFERS: PersonSelectOffer[] = [
  { key: "frame", label: "액자 제작", unit: "개", price: 0, note: "", needs_photo: true, options: [
    { key: "6r", label: "6R (6x8inch)", price: 30_000 },
    { key: "16r", label: "16R (16x20inch)", price: 100_000 },
    { key: "20r", label: "20R (20x24inch)", price: 150_000 },
  ] },
  { key: "album", label: "앨범 제작", unit: "권", price: 200_000, note: "20P 블랙가죽\n5x7inch 액자 포함\n공연사진 10장 추가 포함", needs_photo: false, options: [] },
];
