import type { ToolDef } from "@/lib/toolNav";
import { findFeatureByHref } from "@/lib/olivia/features/registry";
import { resolveFeatureIntent, type FeatureResolution } from "@/lib/olivia/features/resolver";
import { navigateToFeature } from "@/lib/olivia/features/navigationBridge";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

export type OpenFeatureResult =
  | { ok: true; tool: ToolDef }
  | { ok: false; reason: "not_found" | "ambiguous"; candidates?: ToolDef[] };

// Quick Action / 최근 프로젝트 / 일정 클릭 / Olivia 채팅 도구가 전부 이 함수 하나로 수렴한다 —
// route.push를 여기저기 직접 반복하지 않는다.
export function openOliviaFeature(featureId: string): OpenFeatureResult {
  const tool = findFeatureByHref(featureId);
  if (!tool) return { ok: false, reason: "not_found" };
  useOliviaContextStore.getState().recordAction(`feature:open:${featureId}`);
  navigateToFeature(tool.href);
  return { ok: true, tool };
}

// 자연어 문장에서 기능을 찾아 바로 연다. 모호하면 열지 않고 후보를 돌려준다(호출부가 되묻는다).
export function openOliviaFeatureByQuery(query: string): OpenFeatureResult & { resolution: FeatureResolution } {
  const resolution = resolveFeatureIntent(query);
  if (resolution.kind === "match") {
    const result = openOliviaFeature(resolution.tool.href);
    return { ...result, resolution };
  }
  if (resolution.kind === "ambiguous") {
    return { ok: false, reason: "ambiguous", candidates: resolution.candidates, resolution };
  }
  return { ok: false, reason: "not_found", resolution };
}
