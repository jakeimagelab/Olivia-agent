export type NameQuery = {
  raw: string;
  basenameLower: string;
  extLower: string | null;
};

export type SequenceCheckResult = {
  totalFiles: number;
  recognizedNumbers: number[];
  unrecognizedFiles: string[];
  missingRanges: { start: number; end: number }[];
  min: number | null;
  max: number | null;
  rangeTooLarge: boolean;
};

const SEQUENCE_RANGE_LIMIT = 200_000;

export function defaultWorkerFolderPath(displayPath: string, fallbackName: string): string {
  const segments = displayPath
    .split(/\s+\/\s+|\//u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length && fallbackName.trim()) segments.push(fallbackName.trim());
  return segments.length ? `/Volumes/${segments.join("/")}` : "";
}

export function relativeToDirectoryRoot(relativePath: string, rootName: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  const prefix = `${rootName.normalize("NFC")}/`;
  return normalized.normalize("NFC").startsWith(prefix)
    ? normalized.normalize("NFC").slice(prefix.length)
    : normalized;
}

/** 확장자가 있으면 정확히, 없으면 베이스네임만 비교할 검색어로 정규화한다. */
export function parseFileNameQueries(text: string): NameQuery[] {
  const tokens = text.split(/[\r\n,]+/).map((token) => token.trim()).filter(Boolean);
  const seen = new Set<string>();
  const queries: NameQuery[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const match = token.match(/^(.+)\.([A-Za-z0-9]{2,5})$/);
    if (match) {
      queries.push({ raw: token, basenameLower: match[1].toLowerCase(), extLower: match[2].toLowerCase() });
    } else {
      queries.push({ raw: token, basenameLower: token.toLowerCase(), extLower: null });
    }
  }
  return queries;
}

/** 파일명 끝 숫자의 연속 구간을 검사한다. 비정상적으로 큰 범위는 순회하지 않는다. */
export function checkFileSequence(fileNames: readonly string[]): SequenceCheckResult {
  const numberSet = new Set<number>();
  const unrecognizedFiles: string[] = [];

  for (const name of fileNames) {
    const basename = name.replace(/\.[^.]+$/, "");
    const match = basename.match(/(\d+)$/);
    if (!match) {
      unrecognizedFiles.push(name);
      continue;
    }
    numberSet.add(Number(match[1]));
  }

  const recognizedNumbers = Array.from(numberSet).sort((left, right) => left - right);
  const min = recognizedNumbers[0] ?? null;
  const max = recognizedNumbers.at(-1) ?? null;
  const missingRanges: { start: number; end: number }[] = [];
  const rangeTooLarge = min !== null && max !== null && (max - min) > SEQUENCE_RANGE_LIMIT;

  if (min !== null && max !== null && !rangeTooLarge) {
    let gapStart: number | null = null;
    for (let number = min; number <= max; number += 1) {
      if (numberSet.has(number)) {
        if (gapStart !== null) {
          missingRanges.push({ start: gapStart, end: number - 1 });
          gapStart = null;
        }
      } else if (gapStart === null) {
        gapStart = number;
      }
    }
    if (gapStart !== null) missingRanges.push({ start: gapStart, end: max });
  }

  return {
    totalFiles: fileNames.length,
    recognizedNumbers,
    unrecognizedFiles,
    missingRanges,
    min,
    max,
    rangeTooLarge,
  };
}
