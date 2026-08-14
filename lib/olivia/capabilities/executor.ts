import type { ToolDef } from "@/lib/toolNav";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";

// 이 함수는 서버(API route)에서 실행된다. lib/olivia/features/executor.ts의 openOliviaFeature는
// useRouter()/window를 쓰는 브라우저 전용 함수라 서버에서 직접 부를 수 없다 — 대신 브라우저가 이미
// 처리할 줄 아는 것과 완전히 같은 모양의 OPEN_FEATURE UI Action을 만들어 SSE로 흘려보내면,
// 클라이언트의 기존 executeOliviaAction(actionRouter.ts)이 받아서 navigateToFeature를 호출한다 —
// GPT의 open_feature 도구 경로와 실행 결과가 완전히 동일하다.
export function buildOpenFeatureAction(tool: ToolDef): OliviaUiAction {
  return { type: "OPEN_FEATURE", href: tool.href };
}
