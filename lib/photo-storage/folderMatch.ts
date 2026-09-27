export type FolderMatch = {
  displayName: string;
  core: string;
  score: 1 | 2;
  start: number;
  end: number;
};

type NormalizedWithIndex = {
  value: string;
  starts: number[];
  ends: number[];
  source: string;
};

const WORD_CHARACTER = /[0-9a-z가-힣]/i;
const REMOVED_SEPARATOR = /[\s_-]/;

function comparable(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s_-]+/g, "");
}

function normalizeWithIndex(value: string): NormalizedWithIndex {
  const source = value.normalize("NFC").toLocaleLowerCase("ko-KR");
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];

  for (let index = 0; index < source.length;) {
    const codePoint = source.codePointAt(index);
    const character = String.fromCodePoint(codePoint ?? source.charCodeAt(index));
    const next = index + character.length;
    if (!REMOVED_SEPARATOR.test(character)) {
      normalized += character;
      // String#indexOf()는 UTF-16 offset을 돌려주므로 surrogate pair도 각 code unit에
      // 같은 원본 범위를 기록한다. 폴더명 앞에 emoji가 있어도 경계 위치가 어긋나지 않는다.
      for (let unit = 0; unit < character.length; unit += 1) {
        starts.push(index);
        ends.push(next);
      }
    }
    index = next;
  }

  return { value: normalized, starts, ends, source };
}

function previousCharacter(source: string, index: number): string | undefined {
  if (index <= 0) return undefined;
  return Array.from(source.slice(0, index)).at(-1);
}

function nextCharacter(source: string, index: number): string | undefined {
  if (index >= source.length) return undefined;
  return Array.from(source.slice(index))[0];
}

export function folderCoreName(displayName: string): string {
  const normalized = displayName.normalize("NFC").trim();
  const withoutDate = normalized.replace(/^\d{2,8}[\s._-]*/, "").trim();
  return withoutDate || normalized;
}

function findCandidateMatches(input: {
  message: NormalizedWithIndex;
  displayName: string;
  core: string;
  needle: string;
  score: 1 | 2;
}): FolderMatch[] {
  const { message, displayName, core, needle, score } = input;
  const matches: FolderMatch[] = [];
  const shortCore = comparable(core).length <= 3;
  let searchFrom = 0;

  while (searchFrom <= message.value.length - needle.length) {
    const found = message.value.indexOf(needle, searchFrom);
    if (found < 0) break;
    const normalizedEnd = found + needle.length;
    const start = message.starts[found];
    const end = message.ends[normalizedEnd - 1];
    const before = previousCharacter(message.source, start);
    const after = nextCharacter(message.source, end);
    const startsAtWordBoundary = before === undefined || !WORD_CHARACTER.test(before);
    const endsAtWordBoundary = !shortCore || after === undefined || !WORD_CHARACTER.test(after);

    if (startsAtWordBoundary && endsAtWordBoundary) {
      matches.push({ displayName, core, score, start, end });
    }
    // 첫 occurrence가 단어 중간이어도 뒤의 다음 occurrence를 계속 검사한다.
    searchFrom = found + 1;
  }

  return matches;
}

export function matchFoldersInMessage(
  message: string,
  folderNames: readonly string[],
): FolderMatch[] {
  const normalizedMessage = normalizeWithIndex(message);
  const matches: FolderMatch[] = [];

  for (const displayName of folderNames) {
    const core = folderCoreName(displayName);
    const coreNeedle = comparable(core);
    if (coreNeedle.length < 2) continue;

    const fullNeedle = comparable(displayName);
    const fullMatches = fullNeedle
      ? findCandidateMatches({ message: normalizedMessage, displayName, core, needle: fullNeedle, score: 2 })
      : [];
    if (fullMatches.length) {
      matches.push(...fullMatches);
      continue;
    }
    matches.push(...findCandidateMatches({
      message: normalizedMessage,
      displayName,
      core,
      needle: coreNeedle,
      score: 1,
    }));
  }

  // 같은 문장 범위를 더 긴 후보가 완전히 덮으면 짧은 후보는 별도 대상이나 모호 후보가
  // 아니다. 범위가 정확히 같은 날짜별 폴더들은 동일 핵심명의 실제 모호 후보이므로 남긴다.
  return matches.filter((candidate, index) => !matches.some((other, otherIndex) => {
    if (index === otherIndex) return false;
    const strictlyContains = other.start <= candidate.start
      && other.end >= candidate.end
      && (other.start < candidate.start || other.end > candidate.end);
    return strictlyContains;
  }));
}

export function groupFolderMatches(matches: readonly FolderMatch[]): FolderMatch[][] {
  const ordered = [...matches].sort((left, right) =>
    left.start - right.start
    || right.end - left.end
    || right.score - left.score
    || right.displayName.length - left.displayName.length,
  );
  const groups: FolderMatch[][] = [];

  for (const match of ordered) {
    const previous = groups.at(-1);
    const previousEnd = previous ? Math.max(...previous.map((candidate) => candidate.end)) : -1;
    if (!previous || match.start >= previousEnd) groups.push([match]);
    else previous.push(match);
  }

  for (const group of groups) {
    group.sort((left, right) =>
      right.score - left.score
      || (right.end - right.start) - (left.end - left.start)
      || right.displayName.length - left.displayName.length,
    );
  }
  return groups;
}

export function resolveFolderTargets(
  message: string,
  folderNames: readonly string[],
): { kind: "none" } | { kind: "targets"; groups: FolderMatch[][] } {
  const groups = groupFolderMatches(matchFoldersInMessage(message, folderNames));
  return groups.length ? { kind: "targets", groups } : { kind: "none" };
}
