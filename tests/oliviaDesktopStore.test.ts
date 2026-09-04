import { beforeEach, describe, expect, it } from "vitest";
import {
  DESKTOP_STATE_VERSION,
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
    expect(win.width).toBeLessThanOrEqual(Math.round(1280 * 0.82));
    expect(win.height).toBeLessThanOrEqual(Math.round((732 - 96) * 0.82));
    expect(win.x).toBeGreaterThanOrEqual(12);
    expect(win.y).toBeGreaterThanOrEqual(12);
  });

  it("invalidates version-1 persisted window geometry", () => {
    expect(DESKTOP_STATE_VERSION).toBe(2);
  });
});
