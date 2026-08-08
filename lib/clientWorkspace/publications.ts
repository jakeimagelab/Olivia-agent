// "공개 관리" 패널이 다루는 자료 종류 — quote/contract는 기존 전용 publish API
// (app/api/quotes/[id]/publish, app/api/contracts/[id]/publish)를 그대로 쓰고,
// 나머지는 이 파일의 범용 publish/revoke 라우트(app/api/publications/...)를 쓴다.
export const GENERIC_PUBLICATION_TYPES = ["conti", "select_gallery", "raw_download", "retouched_gallery", "final_delivery"] as const;
export type GenericPublicationType = (typeof GENERIC_PUBLICATION_TYPES)[number];

export const ALL_PUBLICATION_TYPES = ["quote", "contract", ...GENERIC_PUBLICATION_TYPES] as const;
export type PublicationType = (typeof ALL_PUBLICATION_TYPES)[number];

export const PUBLICATION_TYPE_LABEL: Record<PublicationType, string> = {
  quote: "견적서",
  contract: "계약서",
  conti: "촬영 콘티",
  select_gallery: "셀렉 갤러리",
  raw_download: "원본 다운로드 (RAW)",
  retouched_gallery: "1차 보정본",
  final_delivery: "최종사진 전달",
};

export function isGenericPublicationType(value: string): value is GenericPublicationType {
  return (GENERIC_PUBLICATION_TYPES as readonly string[]).includes(value);
}

// 화면에 보여줄 공개 상태 — pcrm_publications.status(8개 값)를 요청서가 원하는
// 초안/공개대기/공개됨/공개중지 4단계로 뭉뚱그린다.
export type DisplayPublicationStatus = "draft" | "pending_publish" | "published" | "revoked";

export function toDisplayStatus(status: string | null | undefined): DisplayPublicationStatus {
  if (!status) return "draft";
  if (status === "revoked" || status === "archived") return "revoked";
  if (status === "draft" || status === "internal_review") return "pending_publish";
  return "published"; // published/viewed/approved/revision_requested/completed
}

export const DISPLAY_STATUS_LABEL: Record<DisplayPublicationStatus, string> = {
  draft: "초안",
  pending_publish: "공개 대기",
  published: "공개됨",
  revoked: "공개 중지",
};
