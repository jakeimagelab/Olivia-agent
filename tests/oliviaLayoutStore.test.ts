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

  // 스트리밍/포커스로 비율이 계속 바뀌던 이전 동작은 "레이아웃이 자꾸 움직인다"는 사용자
  // 신고(2026-08-30)로 제거됐다 — 이제 workspace 비율은 항상 70/30으로 고정이고, 사용자가
  // 직접 누르는 "대화 크게" 토글(workspace-chat-expanded)만 예외로 남는다.
  it("고정 70/30 비율을 쓰고, streaming/focus 상태는 더 이상 비율에 영향을 주지 않는다", () => {
    expect(getWorkspaceLayoutWeight({ mode: "workspace", chatFocused: false, workspaceFocused: false, streaming: false })).toEqual({ chat: 0.3, workspace: 0.7 });
    expect(getWorkspaceLayoutWeight({ mode: "workspace", chatFocused: true, workspaceFocused: false, streaming: false })).toEqual({ chat: 0.3, workspace: 0.7 });
    expect(getWorkspaceLayoutWeight({ mode: "workspace", chatFocused: false, workspaceFocused: true, streaming: false })).toEqual({ chat: 0.3, workspace: 0.7 });
    expect(getWorkspaceLayoutWeight({ mode: "workspace", chatFocused: false, workspaceFocused: false, streaming: true })).toEqual({ chat: 0.3, workspace: 0.7 });
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
    })).toEqual({ chat: 0.3, workspace: 0.7 });

    useOliviaLayoutStore.getState().setWorkspaceFocused(true);
    expect(getWorkspaceLayoutWeight({
      mode: useOliviaLayoutStore.getState().mode,
      chatFocused: useOliviaLayoutStore.getState().chatFocused,
      workspaceFocused: useOliviaLayoutStore.getState().workspaceFocused,
      streaming: false,
    })).toEqual({ chat: 0.3, workspace: 0.7 });

    useOliviaLayoutStore.getState().expandWorkspaceChat();
    useWorkspaceStore.getState().enterFullscreen();
    expect(useOliviaLayoutStore.getState().mode).toBe("fullscreen");
    useWorkspaceStore.getState().exitFullscreen();
    expect(useOliviaLayoutStore.getState().mode).toBe("workspace-chat-expanded");
    expect(useOliviaConversationStore.getState().messages).toBe(messages);
  });
});
