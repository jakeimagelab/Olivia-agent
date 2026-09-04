import { describe, expect, it } from "vitest";
import {
  getDesktopShortcutApps,
  getDockApps,
  getOliviaApp,
} from "@/components/olivia-os/registry/oliviaAppRegistry";

describe("OLIVIA OS app registry navigation", () => {
  it("uses the approved five-app Desktop shortcut set", () => {
    expect(getDesktopShortcutApps().map((app) => app.id)).toEqual([
      "customer",
      "calendar",
      "photo-workspace",
      "documents",
      "olivia-chat",
    ]);
  });

  it("uses the approved six-app Dock set", () => {
    expect(getDockApps().map((app) => app.id)).toEqual([
      "customer",
      "calendar",
      "photo-workspace",
      "documents",
      "review-studio",
      "olivia-chat",
    ]);
  });

  it("keeps placeholder apps registered without exposing them by default", () => {
    for (const appId of ["quote", "contract", "conti"]) {
      const app = getOliviaApp(appId);
      expect(app).toBeDefined();
      expect(app?.desktopShortcutOrder).toBeUndefined();
      expect(app?.dockOrder).toBeUndefined();
    }
  });
});
