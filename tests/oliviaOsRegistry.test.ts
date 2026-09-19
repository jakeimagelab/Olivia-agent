import { describe, expect, it } from "vitest";
import {
  getDesktopShortcutApps,
  getDockApps,
  getOliviaApp,
  getOliviaAppByRoute,
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

  it("keeps Olivia in the Dock as a movable singleton window", () => {
    expect(getDockApps().map((app) => app.id)).toEqual([
      "customer",
      "calendar",
      "photo-workspace",
      "documents",
      "review-studio",
      "olivia-chat",
    ]);
    expect(getOliviaApp("olivia-chat")).toBeDefined();
  });

  it("keeps non-Dock apps registered for All Apps", () => {
    for (const appId of [
      "quote", "contract", "conti", "memo", "today", "all-apps", "legacy-route",
      "brand-analysis", "trend-dashboard", "hospital-brand-image-diagnosis", "channel-analyzer",
    ]) {
      const app = getOliviaApp(appId);
      expect(app).toBeDefined();
      expect(app?.desktopShortcutOrder).toBeUndefined();
      expect(app?.dockOrder).toBeUndefined();
    }
  });

  it("routes the four analysis workspaces to native adapters", () => {
    expect(getOliviaAppByRoute("/brand-analysis")?.id).toBe("brand-analysis");
    expect(getOliviaAppByRoute("/trend-dashboard?industry=피부과")?.id).toBe("trend-dashboard");
    expect(getOliviaAppByRoute("/hospital-brand-image-diagnosis")?.id).toBe("hospital-brand-image-diagnosis");
    expect(getOliviaAppByRoute("/channel-analyzer?clientId=client-1")?.id).toBe("channel-analyzer");
  });
});
