import { describe, expect, it } from "vitest";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = {
  recentActions: [], revision: 0, activeWorkspace: "quote", activeResourceId: "quote-1", activeClientName: "리나클리닉",
};

describe("shared Olivia document approvals", () => {
  it("견적서 생성 직후에는 방금 만든 문서를 열고 승인 카드는 만들지 않는다", async () => {
    const actions = await resolveUiActions({
      toolCall: { id: "call-1", name: "create_quote", arguments: "{}" },
      input: {},
      result: { tool: "create_quote", success: true, data: { resourceId: "quote-1", quoteId: "quote-1", temporaryDocumentId: "temp-1", hospitalName: "리나클리닉" } },
      context,
    });
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "OPEN_WORKSPACE", workspace: "quote", resourceId: "quote-1" }),
      expect.objectContaining({ type: "OPEN_CLIENT_TASK", task: "quote_preview", flowId: "quote-1" }),
    ]));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "REQUEST_APPROVAL" }));
  });

  it("고객 미연결 견적서는 화면에 열려 있던 다른 고객으로 대체하지 않는다", async () => {
    const actions = await resolveUiActions({
      toolCall: { id: "call-unlinked", name: "create_quote", arguments: "{}" },
      input: {},
      result: { tool: "create_quote", success: true, data: { resourceId: "quote-unlinked", quoteId: "quote-unlinked", hospitalName: "1989 삼칠갈비" } },
      context,
    });
    expect(actions[0]).toMatchObject({ type: "OPEN_WORKSPACE", workspace: "quote", resourceId: "quote-unlinked", clientName: "1989 삼칠갈비" });
    expect(actions[0]).not.toHaveProperty("clientId");
    expect(actions[0]).not.toHaveProperty("workflowRunId");
  });

  it("내용 승인 뒤 고객등록 승인을 같은 프로토콜로 만든다", async () => {
    const actions = await resolveUiActions({
      toolCall: { id: "call-2", name: "approve_temporary_document", arguments: "{}" },
      input: { temporaryDocumentId: "temp-1" },
      result: { tool: "approve_temporary_document", success: true, data: { temporaryDocumentId: "temp-1", approvalRequired: true, summary: "리나클리닉을 고객으로 등록할까요?" } },
      context,
    });
    expect(actions).toEqual([expect.objectContaining({ type: "REQUEST_APPROVAL", toolName: "link_temporary_document_client", toolInput: { temporaryDocumentId: "temp-1" } })]);
  });
});
