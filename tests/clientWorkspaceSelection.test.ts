import { describe, expect, it } from "vitest";
import { resolveClientWorkspaceSelection, resolveEmbeddedClientDetailTarget } from "@/components/clients/ClientsWorkspace";

describe("customer workspace selection", () => {
  it("uses an initial customer when the window context genuinely changes", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: "client-a",
      initialClientChanged: true,
      selectedClientId: "client-b",
      availableClientIds: ["client-a", "client-b"],
    })).toBe("client-a");
  });

  it("keeps the user's newly selected customer instead of restoring stale initial context", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: "client-a",
      initialClientChanged: false,
      selectedClientId: "client-b",
      availableClientIds: ["client-a", "client-b"],
    })).toBe("client-b");
  });

  it("does not choose a customer merely because the customer list opened", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: "missing",
      initialClientChanged: false,
      selectedClientId: "also-missing",
      availableClientIds: ["client-a", "client-b"],
    })).toBeNull();
  });

  it("keeps a list-only window without a selected customer", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: null,
      initialClientChanged: true,
      selectedClientId: null,
      availableClientIds: ["client-a", "client-b"],
    })).toBeNull();
  });
});

describe("embedded customer detail target", () => {
  it("keeps customer and workflow context inside the native window", () => {
    expect(resolveEmbeddedClientDetailTarget("client-a", "workflow-a")).toEqual({
      clientId: "client-a",
      workflowRunId: "workflow-a",
    });
  });

  it("allows customers without a workflow run to open their native detail", () => {
    expect(resolveEmbeddedClientDetailTarget("client-a")).toEqual({
      clientId: "client-a",
      workflowRunId: null,
    });
  });
});
