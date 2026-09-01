import { beforeEach, describe, expect, it } from "vitest";
import { getWorkspaceTransitionKey } from "@/components/workspace/WorkspaceMorphTransition";
import { useOliviaChatDockStore } from "@/lib/store/useOliviaChatDockStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

function node(id: string) {
  return { id } as unknown as HTMLElement;
}

describe("Olivia persistent workspace", () => {
  beforeEach(() => {
    useOliviaChatDockStore.setState({ node: null, activeDockId: undefined, docks: {}, sequence: 0 });
    useWorkspaceStore.setState({ type: null, mode: "home", resourceId: undefined, openedBy: undefined });
    useOliviaLayoutStore.getState().resetToIdle();
    useOliviaConversationStore.setState({ draft: "" });
  });

  it("keeps one active chat host while higher-priority docks appear and disappear", () => {
    const home = node("home");
    const route = node("route");
    const fullscreen = node("fullscreen");
    const store = useOliviaChatDockStore.getState();

    store.setDock("home", home, 70);
    expect(useOliviaChatDockStore.getState()).toMatchObject({ activeDockId: "home", node: home });

    store.setDock("route:contract", route, 80);
    expect(useOliviaChatDockStore.getState()).toMatchObject({ activeDockId: "route:contract", node: route });

    store.setDock("fullscreen", fullscreen, 100);
    expect(useOliviaChatDockStore.getState()).toMatchObject({ activeDockId: "fullscreen", node: fullscreen });

    store.setDock("home", null);
    expect(useOliviaChatDockStore.getState()).toMatchObject({ activeDockId: "fullscreen", node: fullscreen });

    store.setDock("fullscreen", null);
    expect(useOliviaChatDockStore.getState()).toMatchObject({ activeDockId: "route:contract", node: route });
  });

  it("preserves the input draft through workspace and fullscreen transitions", () => {
    useOliviaConversationStore.getState().setDraft("이 견적 10% 할인해줘");
    useWorkspaceStore.getState().openWorkspace("quote", { resourceId: "quote-1" });
    useWorkspaceStore.getState().switchWorkspace("conti", { resourceId: "conti-1" });
    useWorkspaceStore.getState().enterFullscreen();
    useWorkspaceStore.getState().exitFullscreen();
    useWorkspaceStore.getState().closeWorkspace();

    expect(useOliviaConversationStore.getState().draft).toBe("이 견적 10% 할인해줘");
  });

  it("uses workspace identity as the transition key", () => {
    expect(getWorkspaceTransitionKey("quote", "quote-1")).toBe("quote:quote-1");
    expect(getWorkspaceTransitionKey("quote", "quote-2")).toBe("quote:quote-2");
    expect(getWorkspaceTransitionKey("conti", undefined)).toBe("conti:new");
  });

  it("settles on the latest workspace after rapid switches", () => {
    const store = useWorkspaceStore.getState();
    store.openWorkspace("quote", { resourceId: "quote-1" });
    store.switchWorkspace("contract", { resourceId: "contract-1" });
    store.switchWorkspace("conti", { resourceId: "conti-1" });

    expect(useWorkspaceStore.getState()).toMatchObject({
      type: "conti",
      resourceId: "conti-1",
      mode: "split",
    });
  });
});
