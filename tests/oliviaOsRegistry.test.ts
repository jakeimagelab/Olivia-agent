import { describe, expect, it } from "vitest";
import {
  getDesktopShortcutApps,
  getDockApps,
  getOliviaApp,
} from "@/components/olivia-os/registry/oliviaAppRegistry";

describe("OLIVIA OS app registry navigation", () => {
  it("keeps Olivia out of the Desktop shortcut set", () => {
    expect(getDesktopShortcutApps().map((app) => app.id)).toEqual([
      "customer",
      "calendar",
      "photo-workspace",
      "documents",
    ]);
  });

  it("keeps Olivia outside the Dock while retaining it as a movable window", () => {
    expect(getDockApps().map((app) => app.id)).toEqual([
      "customer",
      "calendar",
      "photo-workspace",
      "documents",
      "review-studio",
    ]);
    expect(getOliviaApp("olivia-chat")).toBeDefined();
  });

  it("keeps non-Dock apps registered for All Apps", () => {
    for (const appId of ["quote", "contract", "conti", "memo", "today", "all-apps", "legacy-route"]) {
      const app = getOliviaApp(appId);
      expect(app).toBeDefined();
      expect(app?.desktopShortcutOrder).toBeUndefined();
      expect(app?.dockOrder).toBeUndefined();
    }
  });
});
