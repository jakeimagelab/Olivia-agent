import { describe, expect, it } from "vitest";
import { getInlineTool, hasInProgressInlineTool } from "@/lib/olivia/inline-tools";
import type { OliviaMessage } from "@/lib/olivia/v2/types";

// index.ts를 통해 import해야 builtins.ts의 registerInlineTool() 등록 side effect가 실행된다
// (registry.ts를 직접 import하면 아무것도 등록 안 된 빈 레지스트리를 보게 된다).
describe("quote_preview Inline Tool 등록", () => {
  it("quote_preview가 레지스트리에 등록되어 있고 컴포넌트를 갖는다", () => {
    const definition = getInlineTool("quote_preview");
    expect(definition).toBeDefined();
    expect(typeof definition?.component).toBe("function");
  });

  it("initialState가 done이라 완료 개념이 없는 live 카드는 in_progress로 영구히 남지 않는다", () => {
    expect(getInlineTool("quote_preview")?.initialState).toBe("done");
  });

  it("done 상태 quote_preview 블록은 중복 실행 가드에 걸리지 않는다 — 같은 대화에서 두 번째 견적도 Preview 카드를 받을 수 있다", () => {
    const message: OliviaMessage = {
      id: "m1",
      role: "assistant",
      content: "",
      status: "complete",
      blocks: [{ type: "client_task", flowId: "quote-1", task: "quote_preview", state: "done" }],
    };
    expect(hasInProgressInlineTool([message], "quote_preview")).toBe(false);
  });
});
