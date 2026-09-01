import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { registerOliviaRouter } from "@/lib/olivia/features/navigationBridge";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

describe("actionRouter workspace open/switch URL sync", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ type: null, mode: "home" });
    useOliviaLayoutStore.getState().resetToIdle();
    useOliviaContextStore.getState().clearContext();
  });

  it("SWITCH_WORKSPACE updates the store and replaces (not pushes) the canonical URL", () => {
    const push = vi.fn();
    const replace = vi.fn();
    registerOliviaRouter({ push, replace });

    executeOliviaAction({ type: "SWITCH_WORKSPACE", workspace: "conti", clientId: "c1" });

    expect(useWorkspaceStore.getState().type).toBe("conti");
    expect(useWorkspaceStore.getState().openedBy).toBe("chat");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/conti?clientId=c1");
    expect(push).not.toHaveBeenCalled();
  });

  it("OPEN_WORKSPACE also syncs the URL to the workspace's canonical route", () => {
    const push = vi.fn();
    const replace = vi.fn();
    registerOliviaRouter({ push, replace });

    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "contract" });

    expect(useWorkspaceStore.getState().type).toBe("contract");
    expect(replace).toHaveBeenCalledWith("/contract");
  });

  it("marks chat/card-driven opens as openedBy:chat so they survive navigation", () => {
    registerOliviaRouter({ push: vi.fn(), replace: vi.fn() });
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "quote" });
    expect(useWorkspaceStore.getState().openedBy).toBe("chat");
  });
});
