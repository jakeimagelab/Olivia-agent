export function normalizeNfc(value: string) {
  return value.normalize("NFC");
}

export function normalizeLoginName(value: string) {
  return normalizeNfc(value).replace(/\s+/g, "").trim();
}

/**
 * 촬영 폴더에는 사람을 구분하기 위해 직책을 붙여도, 고객 로그인에는 이름만 쓴다.
 * 단순한 "님"이나 이름 중간의 문자열은 제거하지 않고, 지원하는 끝 직책만 제거한다.
 */
const PERSON_LOGIN_ROLE_SUFFIXES = [
  "대표이사님",
  "부대표님",
  "본부장님",
  "부원장님",
  "회장님",
  "사장님",
  "전무님",
  "상무님",
  "이사님",
  "대표님",
  "원장님",
  "실장님",
  "부장님",
  "차장님",
  "과장님",
  "팀장님",
  "대리님",
  "주임님",
  "교수님",
  "선생님",
] as const;

export function derivePersonLoginName(displayName: string) {
  const normalized = normalizeLoginName(displayName);
  const suffix = PERSON_LOGIN_ROLE_SUFFIXES.find((value) => normalized.endsWith(value));
  if (!suffix) return normalized;
  const withoutRole = normalized.slice(0, -suffix.length);
  return withoutRole || normalized;
}

export function parsePersonFolderName(folderName: string, prefix: string) {
  const name = normalizeNfc(folderName);
  const normalizedPrefix = normalizeNfc(prefix).replace(/_+$/, "");
  const value = name.startsWith(`${normalizedPrefix}_`) ? name.slice(normalizedPrefix.length + 1) : "";
  return value.trim() || null;
}

export function parseGroupFolderName(folderName: string, prefix: string) {
  const name = normalizeNfc(folderName);
  const normalizedPrefix = normalizeNfc(prefix).replace(/_+$/, "");
  if (!name.startsWith(`${normalizedPrefix}_`)) return null;
  return name.slice(normalizedPrefix.length + 1).match(/(\d+반)/)?.[1] ?? null;
}

export type PersonFolderKind =
  | { kind: "person"; name: string }
  | { kind: "group" }
  | { kind: "unnamed" }
  | { kind: "skip" };

const NON_PERSON_FOLDERS = new Set(["selected_raw", "jpg원본", "jpg전체", "jpg", "raw"]);

/**
 * 이름 폴더 구조에서 폴더 하나가 무엇인지 판정한다.
 * 그룹N(단체·그룹 사진)은 작가가 직접 고르므로 고객에게 올리지 않는다.
 * 개인N은 아직 이름을 바꾸지 않은 폴더라 누구 사진인지 몰라 건너뛴다.
 */
export function classifyPersonFolderName(folderName: string): PersonFolderKind {
  const name = normalizeNfc(folderName).trim();
  if (!name || name.startsWith(".") || name.startsWith("_")) return { kind: "skip" };
  if (NON_PERSON_FOLDERS.has(name.toLocaleLowerCase("ko-KR"))) return { kind: "skip" };
  if (/^(그룹|단체)/.test(name)) return { kind: "group" };
  if (/^개인\s*\d+$/.test(name)) return { kind: "unnamed" };
  return { kind: "person", name };
}

/** 개인 폴더 안에서 JPG를 찾을 하위 폴더 이름 (앞에 있을수록 먼저 찾는다) */
export const PERSON_FOLDER_JPG_DIRECTORIES = ["JPG원본", "JPG전체", "JPG"];
