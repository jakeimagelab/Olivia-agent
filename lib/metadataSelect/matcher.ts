/** 기존 셀렉/매칭(lib/selectMatch)과 무관한 독립 모듈 — 메타데이터 셀렉 전용.
 *  파일명이 아니라 EXIF DateTimeOriginal(초 단위)로 고객 선택본 → 원본 JPG → RAW를 연결한다. */

export const METADATA_SELECT_JPG_EXTENSIONS = new Set(["jpg", "jpeg"]);

export type MetadataSelectStatus = "success" | "needs_review" | "metadata_missing" | "raw_missing" | "error";

export interface MetadataSelectRow {
  selectionName: string;
  status: MetadataSelectStatus;
  normalizedDateTime: string | null;
  matchedOriginalName?: string;
  rawName?: string;
  candidateNames?: string[];
  message: string;
}

/** 경로가 섞여 들어와도(예: "folderA/J8A_4231.CR3") 확장자를 뺀 파일명만 돌려준다. */
function basenameOf(name: string): string {
  const leaf = name.split("/").pop() ?? name;
  return leaf.replace(/\.[^.]+$/, "");
}

function extensionOf(name: string): string {
  const leaf = name.split("/").pop() ?? name;
  return leaf.split(".").pop()?.toLowerCase() ?? "";
}

/** 원본 JPG 목록을 정규화된 DateTimeOriginal 기준으로 인덱싱한다. 같은 초에 여러 장이면 배열에 함께 담긴다. */
export function buildOriginalIndex(entries: { name: string; normalizedDateTime: string | null }[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.normalizedDateTime) continue;
    const list = index.get(entry.normalizedDateTime);
    if (list) list.push(entry.name);
    else index.set(entry.normalizedDateTime, [entry.name]);
  }
  return index;
}

/** RAW 파일 목록을 basename(소문자) 기준으로 인덱싱한다. 같은 basename이 여러 개면 배열에 함께 담긴다. */
export function buildRawIndexByBasename(entries: { name: string }[], rawExtensions: Set<string>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const entry of entries) {
    const ext = extensionOf(entry.name);
    if (!rawExtensions.has(ext)) continue;
    const key = basenameOf(entry.name).toLowerCase();
    const list = index.get(key);
    if (list) list.push(entry.name);
    else index.set(key, [entry.name]);
  }
  return index;
}

/** 고객 선택본 1장을 원본 JPG → RAW 순서로 매칭한다. 동일 초 후보가 여럿이면 자동 확정하지 않고 확인 필요로 분류한다. */
export function matchSelectionToRaw(
  selectionName: string,
  normalizedDateTime: string | null,
  originalIndex: Map<string, string[]>,
  rawIndexByBasename: Map<string, string[]>,
): MetadataSelectRow {
  if (!normalizedDateTime) {
    return { selectionName, status: "metadata_missing", normalizedDateTime: null, message: "DateTimeOriginal 없음" };
  }

  const originals = originalIndex.get(normalizedDateTime) ?? [];
  if (originals.length === 0) {
    return { selectionName, status: "needs_review", normalizedDateTime, candidateNames: [], message: "동일 촬영시간의 원본 JPG를 찾지 못했습니다." };
  }
  if (originals.length > 1) {
    return { selectionName, status: "needs_review", normalizedDateTime, candidateNames: originals, message: `동일 촬영시간 후보 ${originals.length}개` };
  }

  const matchedOriginalName = originals[0];
  const basename = basenameOf(matchedOriginalName).toLowerCase();
  const raws = rawIndexByBasename.get(basename) ?? [];
  if (raws.length === 0) {
    return { selectionName, status: "raw_missing", normalizedDateTime, matchedOriginalName, message: "RAW 파일을 찾지 못했습니다." };
  }
  if (raws.length > 1) {
    return { selectionName, status: "needs_review", normalizedDateTime, matchedOriginalName, candidateNames: raws, message: `RAW 후보 중복 (${raws.length}개)` };
  }

  return { selectionName, status: "success", normalizedDateTime, matchedOriginalName, rawName: raws[0], message: "매칭 성공" };
}
