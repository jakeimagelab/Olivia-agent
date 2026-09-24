import { describe, expect, it } from "vitest";
import { resolveUiActions } from "./uiActionResolvers";
import type { OliviaContextSnapshot, OliviaToolResult } from "../v2/types";

const context: OliviaContextSnapshot = { recentActions: [], revision: 0 };

async function actionsFor(tool: string, result: OliviaToolResult) {
  return resolveUiActions({
    toolCall: { id: "call-1", name: tool, arguments: "{}" },
    input: {},
    result,
    context,
  });
}

describe("customer registration UI actions", () => {
  it("refreshes the quote and opens the linked customer in the native customer route", async () => {
    await expect(actionsFor("link_new_client_to_quote", {
      tool: "link_new_client_to_quote",
      success: true,
      data: { resourceId: "quote-1", clientId: "client-1", workflowRunId: "run-1" },
    })).resolves.toEqual([
      { type: "REFRESH_RESOURCE", resource: "quote", resourceId: "quote-1", changedEntityId: undefined, before: undefined, after: undefined },
      { type: "OPEN_FEATURE", href: "/clients?clientId=client-1&workflowRunId=run-1" },
    ]);
  });

  it("opens the registered customer after approving a temporary document", async () => {
    await expect(actionsFor("link_temporary_document_client", {
      tool: "link_temporary_document_client",
      success: true,
      data: { clientId: "client-2" },
    })).resolves.toEqual([
      { type: "OPEN_FEATURE", href: "/clients?clientId=client-2" },
    ]);
  });

  it("does not navigate when registration fails", async () => {
    await expect(actionsFor("link_temporary_document_client", {
      tool: "link_temporary_document_client",
      success: false,
      error: "failed",
    })).resolves.toEqual([]);
  });
});
