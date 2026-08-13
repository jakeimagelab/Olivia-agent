import type { ToolDef } from "@/lib/toolNav";
import { getOliviaFeatures } from "@/lib/olivia/features/registry";

export type FeatureResolution =
  | { kind: "none" }
  | { kind: "match"; tool: ToolDef; confidence: number }
  | { kind: "ambiguous"; candidates: ToolDef[] };

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function candidateTexts(tool: ToolDef): string[] {
  return [tool.title, tool.meta, ...(tool.aliases ?? [])];
}

// 자연어 요청을 기존 기능(lib/toolNav.ts ALL_TOOLS)과 매칭한다 — 새 기능을 만들지 않고
// 이미 존재하는 라우트만 대상으로 한다. 우선순위: 완전 일치 → 부분 일치(양방향 포함) →
// 매칭 없음. 부분 일치가 여러 개면 "애매함"으로 반환해서 임의 실행을 막는다(호출부가 되묻는다).
export function resolveFeatureIntent(query: string): FeatureResolution {
  const q = normalize(query);
  if (!q) return { kind: "none" };

  const features = getOliviaFeatures();

  const exact = features.filter((tool) => candidateTexts(tool).some((c) => normalize(c) === q));
  if (exact.length === 1) return { kind: "match", tool: exact[0], confidence: 1 };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };

  const partial = features.filter((tool) =>
    candidateTexts(tool).some((c) => {
      const nc = normalize(c);
      return nc.length >= 2 && (q.includes(nc) || nc.includes(q));
    })
  );
  if (partial.length === 1) return { kind: "match", tool: partial[0], confidence: 0.7 };
  if (partial.length > 1) {
    // 부분 일치 중 가장 긴 별칭과 매칭된 것을 우선한다 — "고객관리 열어줘"가 "고객"과 "고객관리"
    // 둘 다에 걸리면 더 구체적인 쪽("고객관리")을 고른다.
    const scored = partial.map((tool) => {
      const best = Math.max(...candidateTexts(tool).map((c) => {
        const nc = normalize(c);
        return nc.length >= 2 && (q.includes(nc) || nc.includes(q)) ? nc.length : 0;
      }));
      return { tool, best };
    }).sort((a, b) => b.best - a.best);
    if (scored[0].best > scored[1]?.best) return { kind: "match", tool: scored[0].tool, confidence: 0.6 };
    return { kind: "ambiguous", candidates: partial };
  }

  return { kind: "none" };
}
