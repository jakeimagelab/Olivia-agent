import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Olivia OS full-screen app shell", () => {
  it("renders only the active app and leaves the window manager files available for rollback", () => {
    const surface = readFileSync("components/olivia-os/DesktopSurface.tsx", "utf8");
    const appWindow = readFileSync("components/olivia-os/window/AppWindow.tsx", "utf8");
    const snapOverlay = readFileSync("components/olivia-os/window/SnapZoneOverlay.tsx", "utf8");
    const interactions = readFileSync("components/olivia-os/window/useWindowInteractions.ts", "utf8");

    expect(surface).toContain("const activeWindow = activeWindowId ? windows[activeWindowId] : undefined");
    expect(surface).not.toContain("Object.values(windows).map");
    expect(surface).not.toContain("<SnapZoneOverlay");
    expect(appWindow).toContain("styles.fullScreen");
    expect(appWindow).not.toContain("<WindowHeader");
    expect(appWindow).not.toContain("beginResize");
    expect(snapOverlay).toContain("export function SnapZoneOverlay");
    expect(interactions).toContain("export function useWindowInteractions");
  });

  it("keeps app callers and store APIs unchanged while navigating visit history", () => {
    const surface = readFileSync("components/olivia-os/DesktopSurface.tsx", "utf8");
    const store = readFileSync("lib/store/useOliviaDesktopStore.ts", "utf8");

    expect(surface).toContain("visitHistoryRef");
    expect(surface).toContain('direction = event.key === "["');
    expect(surface).toContain('event.code === "BracketRight"');
    expect(surface).toContain("restoreWindow(previousActiveId)");
    expect(store).toContain("openApp: (input) =>");
    expect(store).toContain("focusWindow: (id) =>");
    expect(store).toContain("closeWindow: (id) =>");
    expect(store).toContain("minimizeWindow: (id) =>");
  });
});
