// 임베딩 모델/차원을 한 곳에서 관리한다 — Postgres vector 컬럼은 생성 시 차원이 고정이라
// 모델을 바꾸면 이 값과 supabase/migrations/20260808_conti_case_library.sql의
// vector(1536)을 함께 갱신해야 한다.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// 신규 콘티 생성 시 프롬프트에 넣을 참고 사례 상한 — 토큰 과다 사용을 막는다.
export const MAX_REFERENCE_SCENES = 8;
export const MAX_REFERENCE_DOCUMENTS = 5;

export const SCENE_TYPES = [
  "profile", "consultation", "procedure", "equipment", "staff", "patient",
  "interior", "exterior", "reception", "waiting", "treatment_room",
  "operating_room", "detail", "branding", "group", "etc",
] as const;

export const SCENE_TYPE_LABELS_KO: Record<string, string> = {
  profile: "프로필",
  consultation: "상담",
  procedure: "시술",
  equipment: "장비",
  staff: "직원",
  patient: "환자",
  interior: "인테리어",
  exterior: "외관",
  reception: "접수",
  waiting: "대기",
  treatment_room: "처치실",
  operating_room: "수술실",
  detail: "디테일",
  branding: "브랜딩",
  group: "단체",
  etc: "기타",
};

export const CASE_DOCUMENT_STATUSES = ["uploaded", "analyzing", "analyzed", "failed"] as const;
