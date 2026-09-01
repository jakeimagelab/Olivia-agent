import { describe, expect, it } from "vitest";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import { executeCommonTool } from "@/lib/olivia/v2/toolExecutors/common";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = {
  activeClientId: "client-1",
  activeProjectId: "project-1",
  recentActions: [],
  revision: 1,
};

describe("photo workspace navigation", () => {
  it("opens the unified photo workspace without inventing a document resource", async () => {
    const result = await executeCommonTool("show_workspace", { workspace: "photo-sort" }, context);
    expect(result).toMatchObject({ success: true, data: { workspace: "photo-sort" } });

    const actions = await resolveUiActions({
      toolCall: { id: "show-photo", name: "show_workspace", arguments: "{}" },
      input: { workspace: "photo-sort" },
      result,
      context,
    });

    expect(actions).toEqual([{
      type: "OPEN_WORKSPACE",
      workspace: "photo-sort",
      resourceId: undefined,
      clientId: "client-1",
      workflowRunId: "project-1",
      clientName: undefined,
      projectName: undefined,
    }]);
  });
});
