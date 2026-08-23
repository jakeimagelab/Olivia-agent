import { resolveFeatureIntent, type FeatureResolution } from "@/lib/olivia/features/resolver";
import type { NavigationCapabilityResolution } from "./types";

// "무엇을 + 여는 동사"로 끝나는 문장만 대상으로 한다. 메시지 전체를 기능 목록과 통째로 대조하면
// "오늘 일정 몇 시야?"처럼 실제로는 데이터 질문인 문장이 "일정"이라는 짧은 별칭과 우연히 겹쳐서
// 화면 이동으로 오판될 수 있다 — 그래서 여는 동사를 뗀 "주어" 부분만 기능 이름과 대조한다.
const OPEN_TRIGGER = /^(.+?)(열어줘|열어봐|열어|보여줘|보여봐|보여|띄워줘|띄워|실행해줘|실행해|실행|켜줘|켜|시작해줘|시작해|시작)$/;

function toResolution(resolution: FeatureResolution): NavigationCapabilityResolution {
  if (resolution.kind === "match") return { kind: "match", tool: resolution.tool, confidence: resolution.confidence };
  if (resolution.kind === "ambiguous") return { kind: "ambiguous", candidates: resolution.candidates };
  return { kind: "none" };
}

export function resolveNavigationCapability(message: string): NavigationCapabilityResolution {
  const trimmed = message.trim();
  if (!trimmed) return { kind: "none" };

  const triggerMatch = trimmed.match(OPEN_TRIGGER);
  const subject = triggerMatch ? triggerMatch[1].trim() : trimmed;
  if (!subject) return { kind: "none" };

  const resolution = resolveFeatureIntent(subject);

  // 단일 match는 완전 일치(confidence===1)일 때만 허용한다 — "견적"/"콘티"/"일정"처럼 짧은
  // 별칭이 "히어산부인과 견적 보여줘"/"오늘 일정 보여줘" 같은 실제 데이터 질문 문장 안에서
  // 부분일치로 걸려 화면 이동으로 오판되는 사고를 막는다(2026-08-14 eval에서 재현·확인). 완전
  // 일치가 아니면(ambiguous 포함) 이 결정론적 경로에서 답을 만들지 않고 항상 GPT+open_feature로
  // 넘긴다 — 애매함 해소는 LLM 쪽 confirm/후보 제시 흐름(코드 요청서 — 자연어 기능 이해 강화,
  // WP2)이 대화 맥락까지 참고해서 더 잘 처리한다.
  if (resolution.kind === "match" && resolution.confidence === 1) return toResolution(resolution);
  return { kind: "none" };
}
