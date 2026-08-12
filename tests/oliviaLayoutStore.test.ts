import { beforeEach, describe, expect, it } from "vitest";
import { getWorkspaceLayoutWeight, useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";

describe("Olivia layout store", () => {
  beforeEach(() => {
    useOliviaLayoutStore.getState().resetToIdle();
    useWorkspaceStore.setState({ type: null, mode: "home" });
  });

  it("reacts before the assistant response by entering conversation mode", () => {
    useOliviaLayoutStore.getState().startConversation();
    expect(useOliviaLayoutStore.getState().mode).toBe("conversation");
  });

  it("restores expanded workspace mode after fullscreen", () => {
    const store = useOliviaLayoutStore.getState();
    store.openWorkspaceMode();
    useOliviaLayoutStore.getState().expandWorkspaceChat();
    useOliviaLayoutStore.getState().enterFullscreen();
    useOliviaLayoutStore.getState().exitFullscreen();
    expect(useOliviaLayoutStore.getState().mode).toBe("workspace-chat-expanded");
  });

  it("uses the requested adaptive weights", () => {
    expect(getWorkspaceLayoutWeight({ mode: "workspace", chatFocused: false, workspaceFocused: false, streaming: false })).toEqual({ chat: 0.34, workspace: 0.66 });
    expect(getWorkspaceLayoutWeight({ mode: "workspace", chatFocused: true, workspaceFocused: false, streaming: false })).toEqual({ chat: 0.42, workspace: 0.58 });
    expect(getWorkspaceLayoutWeight({ mode: "workspace", chatFocused: false, workspaceFocused: true, streaming: false })).toEqual({ chat: 0.27, workspace: 0.73 });
    expect(getWorkspaceLayoutWeight({ mode: "workspace-chat-expanded", chatFocused: false, workspaceFocused: false, streaming: false })).toEqual({ chat: 0.62, workspace: 0.38 });
  });

  it("keeps conversation state while workspace focus and fullscreen modes change", () => {
    const messages = useOliviaConversationStore.getState().messages;
    useOliviaLayoutStore.getState().startConversation();
    useWorkspaceStore.getState().openWorkspace("quote");
    expect(useOliviaLayoutStore.getState().mode).toBe("workspace");

    useOliviaLayoutStore.getState().setChatFocused(true);
    expect(getWorkspaceLayoutWeight({
      mode: useOliviaLayoutStore.getState().mode,
      chatFocused: useOliviaLayoutStore.getState().chatFocused,
      workspaceFocused: useOliviaLayoutStore.getState().workspaceFocused,
      streaming: false,
    })).toEqual({ chat: 0.42, workspace: 0.58 });

    useOliviaLayoutStore.getState().setWorkspaceFocused(true);
    expect(getWorkspaceLayoutWeight({
      mode: useOliviaLayoutStore.getState().mode,
      chatFocused: useOliviaLayoutStore.getState().chatFocused,
      workspaceFocused: useOliviaLayoutStore.getState().workspaceFocused,
      streaming: false,
    })).toEqual({ chat: 0.27, workspace: 0.73 });

    useOliviaLayoutStore.getState().expandWorkspaceChat();
    useWorkspaceStore.getState().enterFullscreen();
    expect(useOliviaLayoutStore.getState().mode).toBe("fullscreen");
    useWorkspaceStore.getState().exitFullscreen();
    expect(useOliviaLayoutStore.getState().mode).toBe("workspace-chat-expanded");
    expect(useOliviaConversationStore.getState().messages).toBe(messages);
  });
});
