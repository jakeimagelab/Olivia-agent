import { describe, expect, it } from "vitest";
import { resolveClientWorkspaceSelection } from "@/components/clients/ClientsWorkspace";

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

  it("falls back to the first available customer when the selection disappeared", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: "missing",
      initialClientChanged: false,
      selectedClientId: "also-missing",
      availableClientIds: ["client-a", "client-b"],
    })).toBe("client-a");
  });
});
