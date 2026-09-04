import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { useOliviaDesktopStore, resetDesktopSession } from "@/lib/store/useOliviaDesktopStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";

// OLIVIA OS Chat → Desktop Window Routing Fix(P0) — OS canonical route("/", "/desktop")에서는
// 채팅 명령이 절대 legacy full-page route로 이동하면 안 된다(대신 AppWindow open/focus).
// window.location.pathname을 직접 스텁해 isOliviaOsRoute()의 분기를 결정적으로 테스트한다.
function stubPathname(pathname: string) {
  vi.stubGlobal("window", { location: { pathname } });
}

describe("actionRouter — OLIVIA OS routing", () => {
  beforeEach(() => {
    resetDesktopSession();
    useWorkspaceStore.setState({ type: null, mode: "home" });
    useOliviaLayoutStore.setState({ mode: "idle", previousMode: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("OPEN_WORKSPACE(photo-sort)는 OS 라우트에서 AppWindow만 열고 pathname은 그대로 둔다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "photo-sort" });

    expect(window.location.pathname).toBe("/");
    expect(useOliviaDesktopStore.getState().windows["photo-workspace"]).toBeDefined();
    // legacy workspace store도 호환을 위해 갱신은 되지만, layout이 workspace 모드로 안 바뀐다.
    expect(useOliviaLayoutStore.getState().mode).toBe("idle");
  });

  it("SWITCH_WORKSPACE(contract)는 OS 라우트에서 AppWindow만 연다", () => {
    stubPathname("/desktop");
    executeOliviaAction({ type: "SWITCH_WORKSPACE", workspace: "contract" });

    expect(window.location.pathname).toBe("/desktop");
    expect(useOliviaDesktopStore.getState().windows["contract"]).toBeDefined();
  });

  it("이미 열려 있으면 singleton 규칙대로 focus만 하고 중복 생성하지 않는다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "conti" });
    const firstId = useOliviaDesktopStore.getState().windows["conti"].zIndex;
    executeOliviaAction({ type: "SWITCH_WORKSPACE", workspace: "conti" });

    expect(Object.keys(useOliviaDesktopStore.getState().windows)).toHaveLength(1);
    expect(useOliviaDesktopStore.getState().activeWindowId).toBe("conti");
    expect(useOliviaDesktopStore.getState().windows["conti"].zIndex).toBeGreaterThanOrEqual(firstId);
  });

  it("OPEN_FEATURE(/clients)는 OS 라우트에서 customer AppWindow를 연다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_FEATURE", href: "/clients" });

    expect(window.location.pathname).toBe("/");
    expect(useOliviaDesktopStore.getState().windows["customer"]).toBeDefined();
  });

  it("OPEN_FEATURE(/review-studio)는 OS 라우트에서 review-studio AppWindow를 연다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_FEATURE", href: "/review-studio" });

    expect(useOliviaDesktopStore.getState().windows["review-studio"]).toBeDefined();
  });

  it("매핑 없는 OPEN_FEATURE href는 OS 라우트에서 아무 창도 열지 않고 조용히 무시한다", () => {
    stubPathname("/");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    executeOliviaAction({ type: "OPEN_FEATURE", href: "/some-unmapped-feature" });

    expect(Object.keys(useOliviaDesktopStore.getState().windows)).toHaveLength(0);
    expect(window.location.pathname).toBe("/");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("ENTER_FULLSCREEN/EXIT_FULLSCREEN은 OS 라우트에서 legacy fullscreen으로 전환하지 않는다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "ENTER_FULLSCREEN" });

    expect(useWorkspaceStore.getState().mode).not.toBe("fullscreen");
    expect(useOliviaLayoutStore.getState().mode).not.toBe("fullscreen");
  });

  it("legacy 라우트(OS 아님)에서는 기존처럼 AppWindow를 열지 않는다", () => {
    stubPathname("/photo-sorting");
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "photo-sort" });

    expect(Object.keys(useOliviaDesktopStore.getState().windows)).toHaveLength(0);
    expect(useWorkspaceStore.getState().type).toBe("photo-sort");
    expect(useOliviaLayoutStore.getState().mode).toBe("workspace");
  });
});
