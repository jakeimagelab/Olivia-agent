import type { ToolDef } from "@/lib/toolNav";
import { getOliviaFeatures } from "@/lib/olivia/features/registry";

export type FeatureResolution =
  | { kind: "none"; candidates?: ToolDef[] }
  | { kind: "match"; tool: ToolDef; confidence: number }
  | { kind: "ambiguous"; candidates: ToolDef[] };

// resolveNavigationCapability(lib/olivia/capabilities/resolver.ts)가 결정론적 bypass를 허용하는
// 유일한 기준 — 완전 일치일 때만 1.0이 나오므로 이 값은 절대 다른 매칭 방식으로 도달하면 안 된다.
const EXACT_CONFIDENCE = 1;
const AUTO_EXECUTE_THRESHOLD = 0.85;
const AMBIGUOUS_THRESHOLD = 0.35;
const CONTEXT_BONUS = 0.05;
const CONTEXT_BONUS_CAP = 0.84;

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

// "셀렉매칭기능말이야" → "셀렉매칭" 처럼, 기능 이름과 무관한 군더더기 표현을 제거한다.
// 제거 후 완전히 빈 문자열이 되면(예: 입력이 필러어 하나뿐이면) 원문을 그대로 쓴다 — 의미
// 파괴를 막기 위함.
const FILLER_WORDS = [
  "기능이야", "기능이지", "기능", "말이야", "말이지", "화면", "페이지", "메뉴",
  "좀", "해줘", "해봐", "줘봐", "열어줘", "열어봐", "열어", "보여줘", "보여봐", "보여",
  "띄워줘", "띄워", "실행해줘", "실행해", "실행",
];

function stripFillers(normalized: string): string {
  let result = normalized;
  for (const filler of FILLER_WORDS) {
    result = result.split(normalize(filler)).join("");
  }
  return result || normalized;
}

function candidateTexts(tool: ToolDef): string[] {
  return [tool.title, tool.meta, ...(tool.aliases ?? [])];
}

// 외부 라이브러리 없이 구현한 Dice 계수(문자 bigram 교집합 기반 유사도) — "셀랙매칭"처럼 오타가
// 섞인 표현이 "셀렉매칭"과 얼마나 비슷한지 대략적으로 잰다. exact/substring/keyword가 전부
// 0점일 때만 마지막 수단으로 시도한다.
function charBigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
  return set;
}

function bigramSimilarity(a: string, b: string): number {
  const bigramsA = charBigrams(a);
  const bigramsB = charBigrams(b);
  if (!bigramsA.size || !bigramsB.size) return 0;
  let overlap = 0;
  for (const gram of bigramsA) if (bigramsB.has(gram)) overlap += 1;
  return (2 * overlap) / (bigramsA.size + bigramsB.size);
}

// 별칭/제목 토큰이 질의에 얼마나 겹치는지(부분 문자열 커버리지)로 점수를 매긴다.
function scoreCandidate(tool: ToolDef, normalizedQuery: string): number {
  const texts = candidateTexts(tool).map(normalize).filter(Boolean);
  let best = 0;

  for (const text of texts) {
    if (text === normalizedQuery) {
      best = Math.max(best, EXACT_CONFIDENCE);
      continue;
    }
    if (normalizedQuery.includes(text) || text.includes(normalizedQuery)) {
      const coverage = Math.min(text.length, normalizedQuery.length) / Math.max(text.length, normalizedQuery.length);
      best = Math.max(best, 0.55 + coverage * 0.25); // 0.55~0.80
      continue;
    }
    const sim = bigramSimilarity(text, normalizedQuery);
    if (sim > 0.5) best = Math.max(best, 0.35 + sim * 0.3); // 0.35~0.65
  }

  return Math.min(best, EXACT_CONFIDENCE);
}

export interface FeatureResolutionContext {
  /** 최근 언급/사용된 기능의 href 목록 — 한 단어 요청("콘티")이 최근 문맥과 맞으면 소폭 가산한다. */
  recentFeatureHrefs?: string[];
}

// 자연어 요청을 기존 기능(lib/toolNav.ts ALL_TOOLS)과 매칭한다 — 새 기능을 만들지 않고 이미
// 존재하는 라우트만 대상으로 한다. 완전 일치(1.0)만 resolveNavigationCapability의 결정론적
// bypass를 통과하고, 그 외(0.35~0.84)는 항상 LLM 쪽 open_feature 호출을 거쳐 확인 질문 또는
// 후보 제시로 이어진다 — 절대 "그런 기능은 없는 것 같아요"로 바로 끝내지 않는다.
export function resolveFeatureIntent(query: string, context?: FeatureResolutionContext): FeatureResolution {
  const normalizedQuery = stripFillers(normalize(query));
  if (!normalizedQuery) return { kind: "none" };

  const features = getOliviaFeatures();
  const scored = features
    .map((tool) => ({ tool, score: scoreCandidate(tool, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { kind: "none" };

  const [top, second] = scored;

  if (context?.recentFeatureHrefs?.includes(top.tool.href) && top.score >= 0.5) {
    top.score = Math.min(CONTEXT_BONUS_CAP, top.score + CONTEXT_BONUS);
  }

  // 완전 일치 — resolveNavigationCapability의 confidence===1 게이트와 호환되는 유일한 경로.
  if (top.score >= AUTO_EXECUTE_THRESHOLD && (!second || top.score - second.score >= 0.15)) {
    return { kind: "match", tool: top.tool, confidence: top.score };
  }

  // 상위 두 후보가 근소한 차이면 임의로 고르지 않고 후보를 보여주며 되묻는다.
  if (second && top.score - second.score < 0.1 && top.score >= 0.5) {
    return {
      kind: "ambiguous",
      candidates: scored.filter((entry) => entry.score >= top.score - 0.1).slice(0, 3).map((entry) => entry.tool),
    };
  }

  if (top.score >= 0.6) {
    return { kind: "match", tool: top.tool, confidence: top.score };
  }

  if (top.score >= AMBIGUOUS_THRESHOLD) {
    return { kind: "ambiguous", candidates: scored.slice(0, Math.min(3, scored.length)).map((entry) => entry.tool) };
  }

  // 진짜 못 찾은 경우도 dead-end로 끝내지 않고, 그나마 가까운 후보를 함께 돌려준다.
  return { kind: "none", candidates: scored.slice(0, 3).map((entry) => entry.tool) };
}
