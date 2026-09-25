import type { classifyOliviaRequest } from "@/lib/olivia/v2/modelRouter";

// PHASE 4 작업 5(2026-09-25) — app/api/olivia/v2/stream/route.ts에서 그대로 옮겼다. 동작 변경 없음.
// 도구가 20여 개(견적/콘티) → 45개 이상(캘린더/워크플로우/메일링/갤러리/이메일/브리핑/미팅/진단 추가)으로
// 늘면서 "이번달 일정 보여주고 계약 안 된 곳 견적 다시 보내줘" 같은 복합 요청이 한 라운드로 안 끝날
// 수 있어 4 → 6 → 12로 올렸다(2026-08-15, 코드 요청서 1번 항목 — 무한 루프 세이프가드는 그대로 유지).
export function maxToolRounds(requestClass: ReturnType<typeof classifyOliviaRequest>) {
  if (requestClass === "FAST_COMMAND") return 2;
  if (requestClass === "NORMAL_CHAT") return 3;
  if (requestClass === "TOOL_ACTION") return 5;
  return 6;
}
