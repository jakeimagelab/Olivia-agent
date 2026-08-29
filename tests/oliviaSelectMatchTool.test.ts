import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/olivia/crud/executor", () => ({ executeOliviaCrud: vi.fn() }));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const baseContext: OliviaContextSnapshot = { recentActions: [], revision: 1 };

// start_select_match_flow는 서버 작업이 전혀 없다 — flowId만 발급해서 클라이언트가 채팅 카드/
// 스토어를 초기화하도록 한다(Inline Tool Framework의 첫 번째 도구). 이 테스트는 프레임워크
// 리팩터링(actionTypes.ts/types.ts의 task 필드 string 확장, uiActionResolvers.ts 등)이 이 도구의
// 기존 동작을 깨지 않았는지 확인하는 회귀 테스트다.
describe("start_select_match_flow tool (regression — no server work, just flowId)", () => {
  it("returns success with a generated flowId and no params required", async () => {
    const execution = await executeAgentTool({ id: "call-1", name: "start_select_match_flow", arguments: "{}" }, baseContext);
    expect(execution.result.success).toBe(true);
    expect(typeof execution.result.data?.flowId).toBe("string");
    expect((execution.result.data?.flowId as string).length).toBeGreaterThan(0);
  });

  it("resolves to an OPEN_CLIENT_TASK ui action carrying the same flowId and task id", async () => {
    const execution = await executeAgentTool({ id: "call-2", name: "start_select_match_flow", arguments: "{}" }, baseContext);
    const flowId = execution.result.data?.flowId as string;
    expect(execution.uiActions).toEqual([{ type: "OPEN_CLIENT_TASK", task: "select_match", flowId }]);
  });
});
