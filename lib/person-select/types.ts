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
  created_at?: string;
  updated_at?: string;
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
