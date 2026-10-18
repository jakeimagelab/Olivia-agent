import { describe, expect, it } from "vitest";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = {
  recentActions: [], revision: 0, activeWorkspace: "quote", activeResourceId: "quote-1", activeClientName: "리나클리닉",
};

describe("shared Olivia document approvals", () => {
  it("견적서 생성 요청은 저장 전에 만들기 확인 카드를 만든다", async () => {
    const actions = await resolveUiActions({
      toolCall: { id: "call-1", name: "create_quote", arguments: "{}" },
      input: {},
      result: { tool: "create_quote", success: true, data: { approvalRequired: true, reading: { clientName: "리나클리닉" }, brand: "photoclinic", requestText: "리나클리닉 견적서", preview: "이렇게 읽었어요" } },
      context,
    });
    expect(actions).toEqual([expect.objectContaining({ type: "REQUEST_APPROVAL", toolName: "apply_quote_create", confirmLabel: "만들기", summary: "이렇게 읽었어요" })]);
  });

  it("승인 후 저장된 고객 미연결 견적서는 화면의 다른 고객으로 대체하지 않는다", async () => {
    const actions = await resolveUiActions({
      toolCall: { id: "call-unlinked", name: "apply_quote_create", arguments: "{}" },
      input: {},
      result: { tool: "apply_quote_create", success: true, data: { resourceId: "quote-unlinked", quoteId: "quote-unlinked", hospitalName: "1989 삼칠갈비" } },
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
