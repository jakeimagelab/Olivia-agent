import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { requestOliviaDesktopExitConfirmation } from "@/lib/olivia/desktopExitGuard";

describe("Olivia OS exit confirmation", () => {
  it("requests the browser's native confirmation before leaving", () => {
    const preventDefault = vi.fn();
    const event = { preventDefault, returnValue: "unchanged" } as unknown as BeforeUnloadEvent;

    requestOliviaDesktopExitConfirmation(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");
  });

  it("leaves Command+W to the browser and preserves Command+M minimize", () => {
    const desktop = readFileSync("components/olivia-os/OliviaDesktop.tsx", "utf8");
    const surface = readFileSync("components/olivia-os/DesktopSurface.tsx", "utf8");
    const topBar = readFileSync("components/olivia-os/DesktopTopBar.tsx", "utf8");

    expect(desktop).toContain('window.addEventListener("beforeunload", requestOliviaDesktopExitConfirmation)');
    expect(desktop).toContain('window.removeEventListener("beforeunload", requestOliviaDesktopExitConfirmation)');
    expect(surface).not.toContain('event.key.toLowerCase() === "w"');
    expect(surface).toContain('event.key.toLowerCase() === "m"');
    expect(topBar).not.toContain("<kbd>⌘W</kbd>");
  });
});
