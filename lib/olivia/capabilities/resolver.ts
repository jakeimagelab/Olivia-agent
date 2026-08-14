import { resolveFeatureIntent, type FeatureResolution } from "@/lib/olivia/features/resolver";
import type { NavigationCapabilityResolution } from "./types";

// "무엇을 + 여는 동사"로 끝나는 문장만 대상으로 한다. 메시지 전체를 기능 목록과 통째로 대조하면
// "오늘 일정 몇 시야?"처럼 실제로는 데이터 질문인 문장이 "일정"이라는 짧은 별칭과 우연히 겹쳐서
// 화면 이동으로 오판될 수 있다 — 그래서 여는 동사를 뗀 "주어" 부분만 기능 이름과 대조한다.
const OPEN_TRIGGER = /^(.+?)(열어줘|열어봐|열어|보여줘|보여봐|보여|실행해줘|실행해|실행|켜줘|켜|시작해줘|시작해|시작)$/;

function toResolution(resolution: FeatureResolution): NavigationCapabilityResolution {
  if (resolution.kind === "match") return { kind: "match", tool: resolution.tool, confidence: resolution.confidence };
  if (resolution.kind === "ambiguous") return { kind: "ambiguous", candidates: resolution.candidates };
  return { kind: "none" };
}

export function resolveNavigationCapability(message: string): NavigationCapabilityResolution {
  const trimmed = message.trim();
  if (!trimmed) return { kind: "none" };

  const triggerMatch = trimmed.match(OPEN_TRIGGER);
  if (triggerMatch) {
    const subject = triggerMatch[1].trim();
    if (subject) return toResolution(resolveFeatureIntent(subject));
  }

  // 여는 동사 없이 기능 이름만 온 경우(예: "고객관리")는 정확히 일치할 때만 허용한다 — 오탐 방지.
  const bare = resolveFeatureIntent(trimmed);
  if (bare.kind === "match" && bare.confidence === 1) return toResolution(bare);

  return { kind: "none" };
}
