/** 기존 셀렉/매칭(lib/selectMatch)과 무관한 독립 모듈 — 메타데이터 셀렉 전용.
 *  EXIF DateTimeOriginal(초 단위) 또는 원본 파일명으로 선택본과 RAW를 연결한다. */

export const METADATA_SELECT_JPG_EXTENSIONS = new Set(["jpg", "jpeg"]);

export type MetadataSelectStatus = "success" | "already_finished" | "needs_review" | "metadata_missing" | "raw_missing" | "error";

export interface MetadataSelectRow {
  selectionName: string;
  status: MetadataSelectStatus;
  normalizedDateTime: string | null;
  matchedOriginalName?: string;
  /** 같은 촬영시간에 원본 JPG가 여러 장인 연사 그룹을 보존한다. */
  matchedOriginalNames?: string[];
  rawName?: string;
  /** rawName은 단일 매칭 소비자 호환용이며, 실제 처리 대상은 이 배열을 사용한다. */
  rawNames?: string[];
  /** 같은 촬영시간 연사 그룹의 반복 참조는 정상으로 판정하기 위한 내부 키. */
  matchGroupKey?: string;
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

/** RAW를 DateTimeOriginal 기준으로 직접 찾을 때도 같은 안전한 다중 후보 인덱스를 쓴다. */
export const buildDateTimeIndex = buildOriginalIndex;

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

/** 고객 선택본 1장을 원본 JPG → RAW 순서로 매칭한다. 같은 초 후보는 연사 그룹으로 모두 선택한다. */
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
  const rawNames: string[] = [];
  let missingRawCount = 0;
  for (const originalName of originals) {
    const raws = rawIndexByBasename.get(basenameOf(originalName).toLowerCase()) ?? [];
    if (raws.length === 0) {
      missingRawCount += 1;
      continue;
    }
    // 한 원본 basename에 서로 다른 경로의 같은 RAW가 여러 개면 연사 그룹이 아니라 여전히 모호하다.
    if (raws.length > 1) {
      return {
        selectionName,
        status: "needs_review",
        normalizedDateTime,
        matchedOriginalName: originals[0],
        matchedOriginalNames: originals,
        candidateNames: raws,
        message: `RAW 후보 중복 (${raws.length}개)`,
      };
    }
    rawNames.push(raws[0]);
  }

  const matchedRawNames = uniqueRawNames(rawNames);
  if (matchedRawNames.length === 0) {
    return {
      selectionName,
      status: "raw_missing",
      normalizedDateTime,
      matchedOriginalName: originals[0],
      matchedOriginalNames: originals,
      message: "RAW 파일을 찾지 못했습니다.",
    };
  }

  const message = originals.length === 1
    ? "매칭 성공"
    : missingRawCount > 0
      ? `동일 촬영시간 ${originals.length}장 중 RAW ${matchedRawNames.length}장 매칭 · ${missingRawCount}장 미발견`
      : `동일 촬영시간 RAW ${matchedRawNames.length}장 모두 선택`;
  return {
    selectionName,
    status: "success",
    normalizedDateTime,
    matchedOriginalName: originals[0],
    matchedOriginalNames: originals,
    rawName: matchedRawNames[0],
    rawNames: matchedRawNames,
    matchGroupKey: `datetime:${normalizedDateTime}`,
    message,
  };
}

/** 파일명이 유지된 선택본은 원본 JPG를 거치지 않고 같은 basename의 RAW와 직접 연결한다. */
export function matchSelectionNameToRaw(
  selectionName: string,
  rawIndexByBasename: Map<string, string[]>,
): MetadataSelectRow {
  const raws = rawIndexByBasename.get(basenameOf(selectionName).toLowerCase()) ?? [];
  if (raws.length === 0) {
    return {
      selectionName,
      status: "raw_missing",
      normalizedDateTime: null,
      matchedOriginalName: selectionName,
      message: "같은 파일명의 RAW를 찾지 못했습니다.",
    };
  }
  if (raws.length > 1) {
    return {
      selectionName,
      status: "needs_review",
      normalizedDateTime: null,
      matchedOriginalName: selectionName,
      candidateNames: raws,
      message: `RAW 후보 중복 (${raws.length}개)`,
    };
  }
  return {
    selectionName,
    status: "success",
    normalizedDateTime: null,
    matchedOriginalName: selectionName,
    rawName: raws[0],
    rawNames: [raws[0]],
    matchGroupKey: `name:${rawIdentityKey(selectionName)}`,
    message: "파일명 직접 매칭 성공",
  };
}

/** 파일명이 바뀐 선택본을 원본 JPG 없이 DateTimeOriginal로 RAW에 직접 연결한다. */
export function matchSelectionDateTimeToRaw(
  selectionName: string,
  normalizedDateTime: string | null,
  rawIndexByDateTime: Map<string, string[]>,
): MetadataSelectRow {
  if (!normalizedDateTime) {
    return {
      selectionName,
      status: "metadata_missing",
      normalizedDateTime: null,
      message: "DateTimeOriginal 없음",
    };
  }

  const raws = rawIndexByDateTime.get(normalizedDateTime) ?? [];
  if (raws.length === 0) {
    return {
      selectionName,
      status: "raw_missing",
      normalizedDateTime,
      message: "동일 촬영시간의 RAW를 찾지 못했습니다.",
    };
  }
  return {
    selectionName,
    status: "success",
    normalizedDateTime,
    rawName: raws[0],
    rawNames: uniqueRawNames(raws),
    matchGroupKey: `datetime:${normalizedDateTime}`,
    message: raws.length === 1 ? "촬영시간 직접 매칭 성공" : `동일 촬영시간 RAW ${raws.length}장 모두 선택`,
  };
}

function rawOutputKey(name: string): string {
  return (name.split("/").pop() ?? name).normalize("NFC").toLocaleLowerCase("en-US");
}

function rawIdentityKey(name: string): string {
  return name.normalize("NFC").replaceAll("\\", "/").toLocaleLowerCase("en-US");
}

/** 단일 매칭 시절의 rawName과 다중 연사 매칭을 한 방식으로 읽는다. */
export function rawNamesOf(row: Pick<MetadataSelectRow, "rawName" | "rawNames">): string[] {
  if (row.rawNames?.length) return row.rawNames;
  return row.rawName ? [row.rawName] : [];
}

/** 같은 RAW 경로를 여러 선택본이 참조해도 실제 파일 작업은 한 번만 한다. */
export function uniqueRawNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = rawIdentityKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 같은 연사 그룹의 반복 참조는 정상이다. 서로 다른 촬영시간 그룹이 같은 RAW를 참조할 때만
 * 해당 행을 검토 대상으로 바꿔 파일을 잘못 처리하지 않게 한다.
 */
export function markDuplicateRawMatches(rows: readonly MetadataSelectRow[]): MetadataSelectRow[] {
  const groupsByRaw = new Map<string, Set<string>>();
  const rowsByRaw = new Map<string, Set<number>>();
  for (const [index, row] of rows.entries()) {
    if (row.status !== "success") continue;
    const group = row.matchGroupKey ?? `legacy:${index}`;
    for (const rawName of rawNamesOf(row)) {
      const key = rawOutputKey(rawName);
      const groups = groupsByRaw.get(key) ?? new Set<string>();
      groups.add(group);
      groupsByRaw.set(key, groups);
      const indices = rowsByRaw.get(key) ?? new Set<number>();
      indices.add(index);
      rowsByRaw.set(key, indices);
    }
  }

  const reviewIndexes = new Set<number>();
  for (const [key, groups] of groupsByRaw) {
    if (groups.size < 2) continue;
    for (const index of rowsByRaw.get(key) ?? []) reviewIndexes.add(index);
  }

  return rows.map((row, index) => (
    reviewIndexes.has(index)
      ? {
          ...row,
          status: "needs_review",
          message: "서로 다른 촬영시간이 같은 RAW 또는 출력 파일명을 가리켜 건너뜁니다.",
        }
      : row
  ));
}
