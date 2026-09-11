import { describe, expect, it } from "vitest";
import {
  pendingActionFromUiAction,
  readPendingAction,
  resolvePendingActionContext,
  resolvePendingActionTurn,
  transitionPendingAction,
  type OliviaPendingAction,
} from "./dialogueState";

const pending: OliviaPendingAction = {
  id: "approval-1",
  status: "pending",
  intent: "apply_quote_rebalance",
  toolName: "apply_quote_rebalance",
  toolInput: { discountAmount: 32000 },
  target: { resourceType: "quote", resourceId: "quote-1", title: "리나클리닉" },
  prompt: "230만 원으로 맞출까요?",
  createdAt: "2026-09-11T00:00:00.000Z",
};

describe("Olivia dialogue state", () => {
  it.each(["응", "맞아 230만원으로 맞추면 돼", "해 줘", "그렇게 해"])("승인 표현 %s를 같은 pending action으로 해석한다", (message) => {
    expect(resolvePendingActionTurn(message, pending)).toBe("approve");
  });

  it("보류와 취소를 승인과 구분한다", () => {
    expect(resolvePendingActionTurn("일단 보류", pending)).toBe("defer");
    expect(resolvePendingActionTurn("아니야 취소", pending)).toBe("reject");
  });

  it("금액 정정은 기존 승인을 실행하지 않고 모델 해석으로 넘긴다", () => {
    expect(resolvePendingActionTurn("아니, 240만원으로 맞춰", pending)).toBe("correction");
  });

  it("승인 UI action에서 대상까지 포함한 상태를 만든다", () => {
    const state = pendingActionFromUiAction({
      type: "REQUEST_APPROVAL", approvalId: "a", summary: "진행할까요?", confirmLabel: "진행",
      toolName: "publish_quote", toolInput: {},
    }, { recentActions: [], revision: 0, activeWorkspace: "quote", activeResourceId: "q", activeClientName: "리나클리닉" }, "2026-09-11T00:00:00.000Z");
    expect(state).toMatchObject({ id: "a", status: "pending", toolName: "publish_quote", target: { resourceType: "quote", resourceId: "q", title: "리나클리닉" } });
    expect(readPendingAction({ pendingAction: state })).toEqual(state);
  });

  it("pending target을 빈 채널 context에 복구하고 해결된 상태는 재실행하지 않는다", () => {
    expect(resolvePendingActionContext({ recentActions: [], revision: 0 }, pending)).toMatchObject({ activeWorkspace: "quote", activeResourceId: "quote-1" });
    expect(resolvePendingActionTurn("응", transitionPendingAction(pending, "completed"))).toBe("none");
  });
});
