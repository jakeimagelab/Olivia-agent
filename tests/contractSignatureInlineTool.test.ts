import { describe, expect, it } from "vitest";
import { getInlineTool, hasInProgressInlineTool } from "@/lib/olivia/inline-tools";
import type { OliviaMessage } from "@/lib/olivia/v2/types";

describe("contract_signature Inline Tool 등록 (PHASE 3)", () => {
  it("contract_signature가 레지스트리에 등록되어 있고 컴포넌트를 갖는다", () => {
    const definition = getInlineTool("contract_signature");
    expect(definition).toBeDefined();
    expect(typeof definition?.component).toBe("function");
  });

  it("initialState 기본값(in_progress)이라 서명 완료 전까지 중복 실행 가드가 새 서명 패드를 막는다", () => {
    const message: OliviaMessage = {
      id: "m1",
      role: "assistant",
      content: "",
      status: "complete",
      blocks: [{ type: "client_task", flowId: "contract-1", task: "contract_signature", state: "in_progress" }],
    };
    expect(hasInProgressInlineTool([message], "contract_signature")).toBe(true);
  });

  it("done 상태로 끝나면 더 이상 진행 중으로 잡히지 않는다", () => {
    const message: OliviaMessage = {
      id: "m1",
      role: "assistant",
      content: "",
      status: "complete",
      blocks: [{ type: "client_task", flowId: "contract-1", task: "contract_signature", state: "done" }],
    };
    expect(hasInProgressInlineTool([message], "contract_signature")).toBe(false);
  });
});
