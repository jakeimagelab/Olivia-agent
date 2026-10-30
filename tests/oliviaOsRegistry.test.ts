import { describe, expect, it } from "vitest";
import {
  getDesktopShortcutApps,
  getDockApps,
  getOliviaApp,
  getOliviaAppByRoute,
  resolveOliviaAppRoute,
} from "@/components/olivia-os/registry/oliviaAppRegistry";

describe("OLIVIA OS app registry navigation", () => {
  it("keeps Olivia out of the Desktop shortcut set", () => {
    expect(getDesktopShortcutApps().map((app) => app.id)).toEqual([
      "customer",
      "calendar",
      "olivia-bridge",
      "documents",
    ]);
  });

  it("uses the focused OS Dock sequence", () => {
    const dockApps = getDockApps();
    expect(dockApps.map((app) => app.id)).toEqual([
      "today",
      "customer",
      "calendar",
      "olivia-bridge",
      "video-studio",
      "quote",
      "conti",
      "work-journal",
    ]);
    expect(dockApps.find((app) => app.id === "olivia-bridge")?.title).toBe("Olivia Bridge");
    expect(getOliviaApp("olivia-chat")).toBeDefined();
  });

  it("keeps non-Dock apps registered for All Apps", () => {
    for (const appId of [
      "contract", "memo", "all-apps", "legacy-route", "metadata-select", "review-studio",
      "brand-analysis", "trend-dashboard", "hospital-brand-image-diagnosis", "channel-analyzer",
      "select-galleries", "seo-delivery", "mailing", "report",
      "portrait-consent",
      "staff-guide",
    ]) {
      const app = getOliviaApp(appId);
      expect(app).toBeDefined();
      expect(app?.desktopShortcutOrder).toBeUndefined();
      expect(app?.dockOrder).toBeUndefined();
    }
  });

  it("uses Olivia Bridge as the visible photo workspace and keeps the old shell hidden", () => {
    expect(getOliviaApp("olivia-bridge")).toMatchObject({ title: "Olivia Bridge", route: "/olivia-bridge" });
    expect(getOliviaApp("photo-workspace")).toMatchObject({ route: "/photo-sorting" });
    expect(getOliviaApp("photo-workspace")?.desktopShortcutOrder).toBeUndefined();
    expect(getOliviaApp("photo-workspace")?.dockOrder).toBeUndefined();
  });

  it("keeps conti and portrait consent standalone while mapping old video production", () => {
    expect(getOliviaApp("conti")?.id).toBe("conti");
    expect(getOliviaApp("video-production")?.id).toBe("video-studio");
    expect(getOliviaApp("portrait-consent")?.id).toBe("portrait-consent");
    expect(getOliviaAppByRoute("/portrait-consent")?.id).toBe("portrait-consent");
    expect(resolveOliviaAppRoute("/photo-sorting?tab=plan&tool=conti&clientId=client-1")).toMatchObject({
      app: expect.objectContaining({ id: "conti" }),
      href: "/conti?clientId=client-1",
    });
  });

  it("opens the staff guide as a hidden OS app without adding it to the Dock or Desktop", () => {
    expect(getOliviaApp("staff-guide")).toMatchObject({
      title: "스텝 가이드",
      route: "/staff-guide",
      defaultSize: { width: 560, height: 820 },
      minSize: { width: 380, height: 520 },
    });
    expect(getOliviaAppByRoute("/staff-guide")?.id).toBe("staff-guide");
    expect(getDesktopShortcutApps().some((app) => app.id === "staff-guide")).toBe(false);
    expect(getDockApps().some((app) => app.id === "staff-guide")).toBe(false);
  });

  it("routes the four analysis workspaces to native adapters", () => {
    expect(getOliviaAppByRoute("/brand-analysis")?.id).toBe("brand-analysis");
    expect(getOliviaAppByRoute("/trend-dashboard?industry=피부과")?.id).toBe("trend-dashboard");
    expect(getOliviaAppByRoute("/hospital-brand-image-diagnosis")?.id).toBe("hospital-brand-image-diagnosis");
    expect(getOliviaAppByRoute("/channel-analyzer?clientId=client-1")?.id).toBe("channel-analyzer");
  });

  it("normalizes user-facing workspace aliases before using the legacy iframe", () => {
    const cases = [
      ["/select-match", "photo-workspace", "/photo-sorting?mode=raw-match"],
      ["/metadata-select?clientId=client-1", "metadata-select", "/metadata-select?clientId=client-1"],
      ["/raw-select", "photo-workspace", "/photo-sorting?mode=select&selectMode=tcut"],
      ["/photo-retouching", "photo-workspace", "/photo-sorting?tool=retouch"],
      ["/diagnosis", "hospital-brand-image-diagnosis", "/hospital-brand-image-diagnosis"],
      ["/clients/reviews", "review-studio", "/review-studio"],
      ["/photoclinic?resourceId=quote-1", "quote", "/quote?resourceId=quote-1"],
    ] as const;

    for (const [href, appId, resolvedHref] of cases) {
      const result = resolveOliviaAppRoute(href);
      expect(result?.app.id, href).toBe(appId);
      expect(result?.href, href).toBe(resolvedHref);
      expect(getOliviaAppByRoute(href)?.id, href).toBe(appId);
    }
  });

  it("routes select galleries, delivery, mailing, and work screens to native adapters", () => {
    const cases = [
      ["/select-galleries?clientId=client-1", "select-galleries"],
      ["/select-galleries/gallery-1?workflowRunId=run-1", "select-galleries"],
      ["/seo-delivery?clientId=client-1", "seo-delivery"],
      ["/mailing", "mailing"],
      ["/work-journal", "work-journal"],
      ["/report", "report"],
    ] as const;

    for (const [href, appId] of cases) {
      expect(resolveOliviaAppRoute(href)?.app.id, href).toBe(appId);
      expect(getOliviaAppByRoute(href)?.id, href).toBe(appId);
    }
  });

  it("preserves exact native review routes and leaves unsupported admin routes for compatibility", () => {
    expect(resolveOliviaAppRoute("/review-studio?reviewId=review-1")?.href).toBe("/review-studio?reviewId=review-1");
    expect(resolveOliviaAppRoute("/admin/security")).toBeUndefined();
  });
});
