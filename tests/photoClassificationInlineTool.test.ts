import { describe, expect, it } from "vitest";
import { getInlineTool, hasInProgressInlineTool } from "@/lib/olivia/inline-tools";
import type { OliviaMessage } from "@/lib/olivia/v2/types";

describe("photo_classification Inline Tool 등록 (PHASE 4)", () => {
  it("photo_classification이 레지스트리에 등록되어 있고 컴포넌트를 갖는다", () => {
    const definition = getInlineTool("photo_classification");
    expect(definition).toBeDefined();
    expect(typeof definition?.component).toBe("function");
  });

  it("initialState 기본값(in_progress)이라 완료 전까지 중복 실행 가드가 새 카드를 막는다", () => {
    const message: OliviaMessage = {
      id: "m1",
      role: "assistant",
      content: "",
      status: "complete",
      blocks: [{ type: "client_task", flowId: "flow-1", task: "photo_classification", state: "in_progress" }],
    };
    expect(hasInProgressInlineTool([message], "photo_classification")).toBe(true);
  });

  it("done 상태로 끝나면 더 이상 진행 중으로 잡히지 않는다", () => {
    const message: OliviaMessage = {
      id: "m1",
      role: "assistant",
      content: "",
      status: "complete",
      blocks: [{ type: "client_task", flowId: "flow-1", task: "photo_classification", state: "done" }],
    };
    expect(hasInProgressInlineTool([message], "photo_classification")).toBe(false);
  });
});
