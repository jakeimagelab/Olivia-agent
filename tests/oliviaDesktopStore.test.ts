import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DESKTOP_STATE_VERSION,
  loadDesktopState,
  resetDesktopSession,
  useOliviaDesktopStore,
} from "@/lib/store/useOliviaDesktopStore";

describe("OLIVIA OS desktop store", () => {
  beforeEach(() => {
    resetDesktopSession();
    useOliviaDesktopStore.setState({ workspaceWidth: 1280, workspaceHeight: 732 });
  });

  it("opens a new app as a viewport-fitted floating window", () => {
    useOliviaDesktopStore.getState().openApp({
      appId: "customer", title: "고객관리", width: 1100, height: 700,
    });

    const win = useOliviaDesktopStore.getState().windows.customer;
    expect(win.snapMode).toBe("none");
    expect(win.width).toBeLessThanOrEqual(Math.round(1280 * 0.84));
    expect(win.height).toBeLessThanOrEqual(Math.round((732 - 96) * 0.82));
    expect(win.x).toBeGreaterThanOrEqual(12);
    expect(win.y).toBeGreaterThanOrEqual(12);
  });

  it("returns an active app to Home even when a previous Home stash exists", () => {
    const store = useOliviaDesktopStore.getState();
    store.openApp({ appId: "customer", title: "고객관리", width: 900, height: 640 });
    store.toggleShowDesktop();
    expect(useOliviaDesktopStore.getState().activeWindowId).toBeNull();

    store.restoreWindow("customer");
    expect(useOliviaDesktopStore.getState().activeWindowId).toBe("customer");
    store.toggleShowDesktop();

    const homeState = useOliviaDesktopStore.getState();
    expect(homeState.activeWindowId).toBeNull();
    expect(homeState.windows.customer.minimized).toBe(true);
  });

  it("invalidates fixed-layout persisted window geometry", () => {
    expect(DESKTOP_STATE_VERSION).toBe(6);
  });

  it("moves a docked Olivia child with its main window and detaches it independently", () => {
    const store = useOliviaDesktopStore.getState();
    store.openApp({ appId: "quote", title: "견적서", width: 700, height: 500 });
    store.openApp({ appId: "olivia-chat", title: "Olivia", width: 360, height: 500 });
    store.dockWindow("olivia-chat", "quote", {
      parent: { x: 50, y: 40, width: 700, height: 500 },
      child: { x: 758, y: 40, width: 360, height: 500 },
    });
    store.moveWindow("quote", 80, 70);
    expect(useOliviaDesktopStore.getState().windows["olivia-chat"]).toMatchObject({ x: 788, y: 70, parentWindowId: "quote" });

    store.undockWindow("olivia-chat");
    store.moveWindow("quote", 100, 90);
    expect(useOliviaDesktopStore.getState().windows["olivia-chat"]).toMatchObject({ x: 788, y: 70, parentWindowId: undefined });
  });

  it("minimizes and restores a docked Olivia child with its main window", () => {
    const store = useOliviaDesktopStore.getState();
    store.openApp({ appId: "quote", title: "견적서", width: 700, height: 500 });
    store.openApp({ appId: "olivia-chat", title: "Olivia", width: 360, height: 500 });
    store.dockWindow("olivia-chat", "quote", {
      parent: { x: 50, y: 40, width: 700, height: 500 },
      child: { x: 758, y: 40, width: 360, height: 500 },
    });
    store.minimizeWindow("quote");
    expect(useOliviaDesktopStore.getState().windows["olivia-chat"].minimized).toBe(true);
    store.restoreWindow("quote");
    expect(useOliviaDesktopStore.getState().windows["olivia-chat"].minimized).toBe(false);
  });

  it("places Olivia at the right edge on its first open", () => {
    useOliviaDesktopStore.getState().openApp({
      appId: "olivia-chat", title: "Olivia", width: 420, height: 640, placement: "right",
    });
    const win = useOliviaDesktopStore.getState().windows["olivia-chat"];
    expect(win.snapMode).toBe("none");
    expect(win.x + win.width).toBeLessThanOrEqual(1280 - 12);
    expect(win.x).toBeGreaterThan(700);
  });

  it("updates resource context without replacing the window", () => {
    const store = useOliviaDesktopStore.getState();
    store.openApp({ appId: "quote", title: "견적서", width: 1000, height: 700, context: { clientId: "client-1", resourceId: "quote-1", resourceType: "quote" } });
    const firstBounds = useOliviaDesktopStore.getState().windows.quote;
    store.openApp({ appId: "quote", title: "견적서", width: 1000, height: 700, context: { clientId: "client-1", resourceId: "quote-2", resourceType: "quote" } });
    const updated = useOliviaDesktopStore.getState().windows.quote;
    expect(updated.context?.resourceId).toBe("quote-2");
    expect(updated.x).toBe(firstBounds.x);
    expect(updated.y).toBe(firstBounds.y);
  });

  it("일반 실행은 같은 singleton 창의 위치를 보존하면서 이전 고객·문서 문맥을 교체한다", () => {
    const store = useOliviaDesktopStore.getState();
    store.openApp({
      appId: "quote", title: "견적서 · 이전 병원", width: 1000, height: 700,
      context: { contextScope: "document", clientId: "client-a", workflowRunId: "run-a", documentId: "quote-a" },
    });
    const before = useOliviaDesktopStore.getState().windows.quote;
    store.openApp({
      appId: "quote", title: "견적서", width: 1000, height: 700,
      context: { contextScope: "none", launchIntent: "new", launchRequestId: "launch-new", targetVerified: false },
    });
    const after = useOliviaDesktopStore.getState().windows.quote;
    expect(after).toMatchObject({ x: before.x, y: before.y, width: before.width, height: before.height, title: "견적서" });
    expect(after.context).toEqual({ contextScope: "none", launchIntent: "new", launchRequestId: "launch-new", targetVerified: false });
  });

  it("reuses the contract window while replacing its source quote", () => {
    const store = useOliviaDesktopStore.getState();
    store.openApp({ appId: "contract", title: "계약서", width: 1000, height: 700, context: { sourceQuoteId: "quote-1" } });
    const firstBounds = useOliviaDesktopStore.getState().windows.contract;
    store.openApp({ appId: "contract", title: "계약서", width: 1000, height: 700, context: { sourceQuoteId: "quote-2" } });
    const updated = useOliviaDesktopStore.getState().windows.contract;
    expect(updated.context).toEqual({ sourceQuoteId: "quote-2" });
    expect(updated.x).toBe(firstBounds.x);
    expect(updated.y).toBe(firstBounds.y);
  });

  it("does not publish a new desktop state for an identical window context", () => {
    const store = useOliviaDesktopStore.getState();
    const context = { clientId: "client-1", projectId: "project-1" };
    store.openApp({ appId: "customer", title: "고객관리", width: 900, height: 640, context });
    const before = useOliviaDesktopStore.getState();
    store.updateWindowContext("customer", { ...context });
    expect(useOliviaDesktopStore.getState()).toBe(before);
  });
});

describe("OLIVIA OS persisted workspace migration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetDesktopSession();
  });

  it("keeps conti standalone while moving removed video production into its workspace tab", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    values.set("olivia-os-desktop-state", JSON.stringify({
      version: DESKTOP_STATE_VERSION,
      activeAppId: "video-production",
      windows: [
        { appId: "conti", title: "콘티 스튜디오", x: 10, y: 20, width: 900, height: 600, minimized: false, snapMode: "none" },
        { appId: "video-production", title: "영상제작", x: 30, y: 40, width: 980, height: 640, minimized: false, snapMode: "none" },
        { appId: "portrait-consent", title: "초상권 동의서", x: 50, y: 60, width: 800, height: 620, minimized: true, snapMode: "none" },
      ],
    }));

    loadDesktopState(new Set(["conti", "photo-workspace", "video-studio", "customer", "portrait-consent"]));

    const state = useOliviaDesktopStore.getState();
    expect(Object.keys(state.windows)).toEqual(["conti", "video-studio", "portrait-consent"]);
    expect(state.windows.conti.title).toBe("콘티 스튜디오");
    expect(state.windows["video-studio"].context?.routeHref).toBe("/video-studio?tab=publish&tool=ai-video");
    expect(state.windows["portrait-consent"].title).toBe("초상권 동의서");
    expect(state.windows["portrait-consent"].context).toBeUndefined();
    expect(state.activeWindowId).toBe("video-studio");
  });

  it("removes a stale customer from a restored person-select list window", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    values.set("olivia-os-desktop-state", JSON.stringify({
      version: DESKTOP_STATE_VERSION,
      activeAppId: "person-select",
      windows: [{
        appId: "person-select", title: "개인별 사진 셀렉", x: 10, y: 20, width: 900, height: 600,
        minimized: false, snapMode: "none",
        context: { routeHref: "/person-select", clientId: "client-old", clientName: "이전 병원", workflowRunId: "run-old" },
      }],
    }));

    loadDesktopState(new Set(["person-select"]));
    expect(useOliviaDesktopStore.getState().windows["person-select"].context).toEqual({
      routeHref: "/person-select", contextScope: "none", launchIntent: "new", targetVerified: false,
    });
  });

  it("v5의 대상 없는 견적창은 레이아웃을 유지하면서 일반 새 작성 문맥으로 마이그레이션한다", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    values.set("olivia-os-desktop-state", JSON.stringify({
      version: 5,
      activeAppId: "quote",
      windows: [{
        appId: "quote", title: "견적서 · 이전 병원", x: 42, y: 31, width: 900, height: 600,
        minimized: false, snapMode: "none",
        context: { contextScope: "document", documentType: "quote", clientId: "client-old", clientName: "이전 병원", workflowRunId: "run-old" },
      }],
    }));

    loadDesktopState(new Set(["quote"]));
    const win = useOliviaDesktopStore.getState().windows.quote;
    expect(win).toMatchObject({ title: "견적서", x: 42, y: 31, width: 900, height: 600 });
    expect(win.context).toMatchObject({ contextScope: "none", launchIntent: "new", targetVerified: false });
    expect(win.context?.clientId).toBeUndefined();
    expect(JSON.parse(values.get("olivia-os-desktop-state") ?? "{}").version).toBe(6);
  });

  it("v5의 정확한 견적 UUID는 유지하되 오래된 고객·촬영 건은 문서 재조회 전까지 제거한다", () => {
    const quoteId = "018e2f30-92af-78b1-8f21-67f4404f5027";
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    values.set("olivia-os-desktop-state", JSON.stringify({
      version: 5,
      activeAppId: "quote",
      windows: [{
        appId: "quote", title: "견적서 · 잘못된 병원", x: 10, y: 20, width: 900, height: 600,
        minimized: false, snapMode: "none",
        context: { contextScope: "document", documentType: "quote", documentId: quoteId, resourceId: quoteId, clientId: "client-a", workflowRunId: "run-a" },
      }],
    }));

    loadDesktopState(new Set(["quote"]));
    const win = useOliviaDesktopStore.getState().windows.quote;
    expect(win.title).toBe("견적서");
    expect(win.context).toMatchObject({ documentId: quoteId, resourceId: quoteId, launchIntent: "document", targetVerified: false });
    expect(win.context?.clientId).toBeUndefined();
    expect(win.context?.workflowRunId).toBeUndefined();
  });
});
