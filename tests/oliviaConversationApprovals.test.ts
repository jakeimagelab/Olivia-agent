import { describe, expect, it } from "vitest";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = {
  recentActions: [], revision: 0, activeWorkspace: "quote", activeResourceId: "quote-1", activeClientName: "리나클리닉",
};

describe("shared Olivia document approvals", () => {
  it("문서 생성 결과를 채널 공통 내용 승인으로 만든다", async () => {
    const actions = await resolveUiActions({
      toolCall: { id: "call-1", name: "create_quote", arguments: "{}" },
      input: {},
      result: { tool: "create_quote", success: true, data: { resourceId: "quote-1", quoteId: "quote-1", temporaryDocumentId: "temp-1", hospitalName: "리나클리닉" } },
      context,
    });
    expect(actions).toContainEqual(expect.objectContaining({ type: "REQUEST_APPROVAL", toolName: "approve_temporary_document", toolInput: { temporaryDocumentId: "temp-1" } }));
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
