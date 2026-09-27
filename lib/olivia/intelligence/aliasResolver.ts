import type { EntityAliasLike } from "@/lib/olivia/intelligence/types";

// "히어산부인과" → "히어" 처럼 흔한 병원명 접미사를 떼어 짧은 별칭 후보를 만든다. 2글자
// 미만이면(접미사를 떼도 너무 짧으면) 별칭을 만들지 않는다 — 오히려 다른 이름과 헷갈릴 위험.
// lib/store/oliviaContextStore.ts가 client가 열릴 때마다 이 함수로 별칭을 자동 등록한다 —
// 클라이언트/서버 양쪽에서 같은 로직을 쓰기 위해 스토어가 아니라 여기 한 곳에만 둔다.
const HOSPITAL_NAME_SUFFIXES = [
  "한방병원", "성형외과", "정형외과", "피부과", "산부인과", "비뇨기과", "안과", "치과",
  "한의원", "의원", "병원", "클리닉",
];

export function deriveAlias(fullName: string): string | null {
  const trimmed = fullName.trim();
  for (const suffix of HOSPITAL_NAME_SUFFIXES) {
    if (trimmed.endsWith(suffix) && trimmed.length > suffix.length) {
      const alias = trimmed.slice(0, -suffix.length).trim();
      if (alias.length >= 2) return alias;
    }
  }
  return null;
}

export type AliasMatch = { alias: string; ref: EntityAliasLike; index: number };

function wouldExpandCanonicalName(text: string, index: number, alias: string, canonicalName: string): boolean {
  // 원문이 이미 정식명으로 시작하면 별칭은 정식명의 앞부분일 뿐이다. 이때 치환하면
  // "여의도기통찬의원"이 "여의도기통찬의원의원"으로 늘어난다.
  if (text.startsWith(canonicalName, index)) return true;

  if (!canonicalName.startsWith(alias)) return false;
  const canonicalSuffix = canonicalName.slice(alias.length);
  if (canonicalSuffix && text.slice(index + alias.length).startsWith(canonicalSuffix)) return true;

  // 잘못 생성된 고객명에서 다시 파생된 별칭은 그 자체가 이미 "...의원" 같은 완성된
  // 시설명일 수 있다. 그런 별칭을 더 긴 정식명으로 확장하면 매 요청마다 접미사가 한 겹씩
  // 늘어나므로, 시설 접미사로 끝나는 별칭의 재확장은 허용하지 않는다.
  return HOSPITAL_NAME_SUFFIXES.some((suffix) => alias.endsWith(suffix));
}

// 등록된 별칭 중 text 안에서 실제로 발견되는 것들을 전부 찾는다 — 긴 별칭부터 검사해서
// "히어산" 같은 더 긴 별칭이 있을 때 "히어"가 먼저 매치돼 앞부분만 잘못 치환되는 걸 막는다.
export function findAliasMatches(aliases: Record<string, EntityAliasLike>, text: string): AliasMatch[] {
  const keys = Object.keys(aliases).sort((a, b) => b.length - a.length);
  const matches: AliasMatch[] = [];
  const consumed: [number, number][] = [];
  for (const alias of keys) {
    const ref = aliases[alias];
    let fromIndex = 0;
    while (fromIndex < text.length) {
      const index = text.indexOf(alias, fromIndex);
      if (index === -1) break;
      const end = index + alias.length;
      fromIndex = end;
      if (wouldExpandCanonicalName(text, index, alias, ref.name)) continue;
      // 이미 다른(더 긴) 별칭에 포함된 구간이면 건너뛴다.
      const overlaps = consumed.some(([s, e]) => index < e && end > s);
      if (overlaps) continue;
      matches.push({ alias, ref, index });
      consumed.push([index, end]);
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

// 별칭을 정식 명칭으로 치환한 텍스트를 만든다. 원문에 별칭이 없으면 원문을 그대로 돌려준다.
export function applyAliasRewrite(
  aliases: Record<string, EntityAliasLike> | undefined,
  text: string
): { text: string; applied: { matchedText: string; resolvedName: string }[] } {
  if (!aliases || Object.keys(aliases).length === 0) return { text, applied: [] };
  const matches = findAliasMatches(aliases, text);
  if (matches.length === 0) return { text, applied: [] };

  let result = "";
  let cursor = 0;
  const applied: { matchedText: string; resolvedName: string }[] = [];
  for (const match of matches) {
    if (wouldExpandCanonicalName(text, match.index, match.alias, match.ref.name)) continue;
    result += text.slice(cursor, match.index);
    result += match.ref.name;
    applied.push({ matchedText: match.alias, resolvedName: match.ref.name });
    cursor = match.index + match.alias.length;
  }
  result += text.slice(cursor);
  return { text: result, applied };
}
