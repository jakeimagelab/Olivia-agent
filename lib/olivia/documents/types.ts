// 통합 문서 검색이 다루는 문서 종류. 실제 원본은 quotes/contracts/conti_saves/
// consultation_memos/photo_galleries/select_galleries/mailing_queue 등 서로 다른 테이블에
//그대로 남아있고, 이 타입은 검색 결과를 한 형태로 보여주기 위한 참조(레퍼런스)일 뿐이다 —
// 문서 원본을 복제해서 저장하지 않는다.
export type OliviaDocumentType =
  | "quote"
  | "contract"
  | "storyboard"
  | "report"
  | "checklist"
  | "revision"
  | "memo"
  | "project_document"
  | "uploaded_file"
  | "gallery"
  | "other";

export interface OliviaDocumentRef {
  id: string;
  type: OliviaDocumentType;
  title: string;
  clientId?: string | null;
  clientName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  sourceType: string;
  sourceId: string;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  searchableText?: string;
  route?: string | null;
  fileUrl?: string | null;
  metadata?: Record<string, unknown>;
}

// 사용자가 부르는 이름이 제각각이라("콘티"/"스토리보드"/"촬영콘티") 채팅과 문서함 검색 둘 다
// 같은 정규화를 거쳐야 같은 결과가 나온다 — 여기 한 곳에서만 관리한다.
const DOCUMENT_TYPE_ALIASES: Record<string, OliviaDocumentType> = {
  콘티: "storyboard", 스토리보드: "storyboard", 촬영콘티: "storyboard", 촬영안: "storyboard", 촬영기획: "storyboard",
  견적: "quote", 견적서: "quote", 가격표: "quote", 촬영견적: "quote",
  계약: "contract", 계약서: "contract", 계약문서: "contract",
  수정: "revision", 수정요청: "revision", 수정사항: "revision",
  보고서: "report", 리포트: "report", 업무보고: "report",
  메모: "memo", 상담메모: "memo", 상담기록: "memo",
  갤러리: "gallery", 사진갤러리: "gallery", 셀렉갤러리: "gallery", 셀렉: "gallery",
  메일: "other", 메일링: "other",
};

const KNOWN_TYPES: readonly OliviaDocumentType[] = [
  "quote", "contract", "storyboard", "report", "checklist", "revision",
  "memo", "project_document", "uploaded_file", "gallery", "other",
];

export function normalizeDocumentTypeHint(hint: unknown): OliviaDocumentType | undefined {
  const key = String(hint ?? "").trim();
  if (!key) return undefined;
  if (DOCUMENT_TYPE_ALIASES[key]) return DOCUMENT_TYPE_ALIASES[key];
  const lowered = key.toLowerCase() as OliviaDocumentType;
  return KNOWN_TYPES.includes(lowered) ? lowered : undefined;
}

export const DOCUMENT_TYPE_LABELS: Record<OliviaDocumentType, string> = {
  quote: "견적",
  contract: "계약",
  storyboard: "콘티",
  report: "보고서",
  checklist: "체크리스트",
  revision: "수정요청",
  memo: "메모",
  project_document: "프로젝트 문서",
  uploaded_file: "업로드 파일",
  gallery: "갤러리",
  other: "기타",
};
