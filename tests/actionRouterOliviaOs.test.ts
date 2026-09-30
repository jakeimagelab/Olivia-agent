import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { useOliviaDesktopStore, resetDesktopSession } from "@/lib/store/useOliviaDesktopStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

// OLIVIA OS Chat → Desktop Window Routing Fix(P0) — OS canonical route("/", "/desktop")에서는
// 채팅 명령이 절대 legacy full-page route로 이동하면 안 된다(대신 AppWindow open/focus).
// window.location.pathname을 직접 스텁해 isOliviaOsRoute()의 분기를 결정적으로 테스트한다.
function stubPathname(pathname: string) {
  vi.stubGlobal("window", { location: { pathname, href: pathname } });
}

describe("actionRouter — OLIVIA OS routing", () => {
  beforeEach(() => {
    resetDesktopSession();
    useWorkspaceStore.setState({ type: null, mode: "home" });
    useOliviaLayoutStore.setState({ mode: "idle", previousMode: undefined });
    useOliviaContextStore.getState().clearContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("OPEN_WORKSPACE(photo-sort)는 OS 라우트에서 AppWindow만 열고 pathname은 그대로 둔다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "photo-sort" });

    expect(window.location.pathname).toBe("/");
    expect(useOliviaDesktopStore.getState().windows["photo-workspace"]).toBeDefined();
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

    // 문서 창은 채팅창과 한 묶음으로 연다. 두 번째 요청도 새 창을 더 만들지 않는다.
    expect(Object.keys(useOliviaDesktopStore.getState().windows)).toHaveLength(2);
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

  it("기존 사진/진단 별칭은 legacy iframe 대신 canonical native AppWindow를 연다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_FEATURE", href: "/select-match?clientId=client-1" });
    let win = useOliviaDesktopStore.getState().windows["photo-workspace"];
    expect(win).toBeDefined();
    expect(win.context?.routeHref).toBe("/photo-sorting?mode=raw-match&clientId=client-1");
    expect(useOliviaDesktopStore.getState().windows["legacy-route"]).toBeUndefined();

    executeOliviaAction({ type: "OPEN_FEATURE", href: "/diagnosis" });
    win = useOliviaDesktopStore.getState().windows["hospital-brand-image-diagnosis"];
    expect(win).toBeDefined();
    expect(useOliviaDesktopStore.getState().windows["legacy-route"]).toBeUndefined();
  });

  it("매핑 없는 OPEN_FEATURE href도 Desktop compatibility Window에서 연다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_FEATURE", href: "/some-unmapped-feature" });

    const win = useOliviaDesktopStore.getState().windows["legacy-route"];
    expect(win).toBeDefined();
    expect(win.context?.resourceId).toBe("/some-unmapped-feature");
    expect(window.location.pathname).toBe("/");
  });

  it("resource가 다른 견적 요청은 같은 Window의 context를 갱신한다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "quote", clientId: "client-1", clientName: "글로리의원", resourceId: "quote-1" });
    executeOliviaAction({ type: "SWITCH_WORKSPACE", workspace: "quote", clientId: "client-1", clientName: "글로리의원", resourceId: "quote-2" });

    const win = useOliviaDesktopStore.getState().windows.quote;
    expect(win.context?.resourceId).toBe("quote-2");
    expect(win.context?.clientName).toBe("글로리의원");
    expect(win.title).toContain("글로리의원");
  });

  it("문서 창은 채팅창에 붙어서 열리고, 닫으면 채팅 연결 대상도 함께 해제한다", () => {
    stubPathname("/");
    useOliviaDesktopStore.setState({ workspaceWidth: 1600, workspaceHeight: 1000 });
    executeOliviaAction({
      type: "OPEN_WORKSPACE",
      workspace: "quote",
      clientId: "client-1",
      clientName: "청담스시",
      resourceId: "quote-1",
    });

    expect(useOliviaDesktopStore.getState().windows["olivia-chat"]?.parentWindowId).toBe("quote");
    expect(useOliviaContextStore.getState()).toMatchObject({
      activeClientId: "client-1",
      activeWorkspace: "quote",
      activeResourceId: "quote-1",
    });

    executeOliviaAction({ type: "CLOSE_ACTIVE_WINDOW" });

    expect(useOliviaDesktopStore.getState().windows.quote).toBeUndefined();
    expect(useOliviaDesktopStore.getState().windows["olivia-chat"]?.parentWindowId).toBeUndefined();
    expect(useOliviaContextStore.getState()).toMatchObject({
      activeClientId: undefined,
      activeWorkspace: undefined,
      activeResourceId: undefined,
      currentDocumentId: undefined,
      recentEntities: [],
    });
    expect(useWorkspaceStore.getState()).toMatchObject({
      mode: "home",
      type: null,
      clientName: undefined,
      workspaceTitle: undefined,
    });
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

  // Phase 3 — 창 조작 3종(§36/§37, TEST O/P)
  it("MAXIMIZE_ACTIVE_WINDOW는 OS 라우트에서 활성 창을 maximized로 스냅한다", () => {
    stubPathname("/");
    useOliviaDesktopStore.setState({ workspaceWidth: 1600, workspaceHeight: 1000 });
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "conti" });
    executeOliviaAction({ type: "MAXIMIZE_ACTIVE_WINDOW" });

    expect(useOliviaDesktopStore.getState().windows["conti"].snapMode).toBe("maximized");
  });

  it("CLOSE_ACTIVE_WINDOW는 OS 라우트에서 활성 창을 닫는다", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "conti" });
    executeOliviaAction({ type: "CLOSE_ACTIVE_WINDOW" });

    expect(useOliviaDesktopStore.getState().windows["conti"]).toBeUndefined();
    expect(useOliviaDesktopStore.getState().activeWindowId).toBeNull();
  });

  it("MINIMIZE_ACTIVE_WINDOW는 OS 라우트에서 활성 창을 최소화한다(Dock에는 남음)", () => {
    stubPathname("/");
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "conti" });
    executeOliviaAction({ type: "MINIMIZE_ACTIVE_WINDOW" });

    expect(useOliviaDesktopStore.getState().windows["conti"]).toBeDefined();
    expect(useOliviaDesktopStore.getState().windows["conti"].minimized).toBe(true);
  });

  it("창 조작 3종은 활성 창이 없으면 아무 것도 하지 않는다", () => {
    stubPathname("/");
    expect(() => {
      executeOliviaAction({ type: "MAXIMIZE_ACTIVE_WINDOW" });
      executeOliviaAction({ type: "CLOSE_ACTIVE_WINDOW" });
      executeOliviaAction({ type: "MINIMIZE_ACTIVE_WINDOW" });
    }).not.toThrow();
    expect(Object.keys(useOliviaDesktopStore.getState().windows)).toHaveLength(0);
  });

  it("창 조작 3종은 legacy 라우트에서 no-op이다", () => {
    stubPathname("/photo-sorting");
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "photo-sort" });
    useOliviaDesktopStore.setState({ activeWindowId: "photo-workspace", windows: { "photo-workspace": {
      id: "photo-workspace", appId: "photo-workspace", title: "사진작업실",
      x: 0, y: 0, width: 800, height: 600, minimized: false, snapMode: "none", zIndex: 100,
    } } });
    executeOliviaAction({ type: "MAXIMIZE_ACTIVE_WINDOW" });

    expect(useOliviaDesktopStore.getState().windows["photo-workspace"].snapMode).toBe("none");
  });
});
