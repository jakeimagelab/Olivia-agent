import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveOliviaSurface, shouldUseOliviaMobileSurface } from "@/lib/olivia/mobile/adaptiveSurface";
import { buildTabletNavigationUrl, parseTabletNavigation } from "@/lib/olivia/tablet/navigation";
import { TABLET_APPS, resolveTabletAppIconSource } from "@/components/olivia-tablet/tabletApps";

describe("Olivia Tablet Shell", () => {
  it.each([
    [{ width: 390, height: 844, coarsePointer: true }, "mobile"],
    [{ width: 820, height: 1180, coarsePointer: true }, "mobile"],
    [{ width: 900, height: 1200, coarsePointer: true }, "mobile"],
    [{ width: 1024, height: 1366, coarsePointer: true }, "tablet"],
    [{ width: 1024, height: 768, coarsePointer: true }, "tablet"],
    [{ width: 1366, height: 1024, coarsePointer: true }, "tablet"],
    [{ width: 1366, height: 1024, coarsePointer: false }, "desktop"],
    [{ width: 1440, height: 900, coarsePointer: false }, "desktop"],
  ] as const)("resolves %o to %s", (signals, expected) => {
    expect(resolveOliviaSurface(signals)).toBe(expected);
  });

  it("keeps preview priorities and the legacy mobile contract", () => {
    expect(resolveOliviaSurface({ width: 1440, height: 900, forceTabletPreview: true })).toBe("tablet");
    expect(resolveOliviaSurface({ width: 1440, height: 900, forceMobilePreview: true, forceTabletPreview: true })).toBe("mobile");
    expect(shouldUseOliviaMobileSurface({ width: 390, height: 844, coarsePointer: true })).toBe(true);
    expect(shouldUseOliviaMobileSurface({ width: 1366, height: 1024, coarsePointer: true })).toBe(false);
  });

  it("round-trips Tablet app history without losing the preview flag", () => {
    const href = buildTabletNavigationUrl("https://olivia.photoclinic.kr/?tabletPreview=1", "calendar");
    expect(href).toContain("tabletPreview=1");
    expect(parseTabletNavigation(new URL(href, "https://olivia.photoclinic.kr").search)).toBe("calendar");
    expect(buildTabletNavigationUrl(`https://olivia.photoclinic.kr${href}`, "home")).not.toContain("tabletApp");
  });

  it("uses registry icons where the Desktop app exists and shared Olivia icons otherwise", () => {
    expect(resolveTabletAppIconSource("calendar")).toEqual({ kind: "registry", appId: "calendar" });
    expect(resolveTabletAppIconSource("customer")).toEqual({ kind: "registry", appId: "customer" });
    expect(resolveTabletAppIconSource("channel-analysis")).toEqual({ kind: "shared", iconName: "channel-analysis" });
    expect(TABLET_APPS.map((app) => app.id)).toEqual([
      "home", "customer", "calendar", "documents", "olivia-chat", "review-studio", "memo", "quote-contract",
      "channel-analysis", "brand-image", "voice", "photo-workspace",
    ]);
  });

  it("keeps Tablet navigation independent from the Desktop window store", () => {
    const shell = readFileSync("components/olivia-tablet/OliviaTabletShell.tsx", "utf8");
    const appContent = readFileSync("components/olivia-tablet/TabletAppContent.tsx", "utf8");
    expect(shell).not.toContain("useOliviaDesktopStore");
    expect(appContent).not.toContain("useOliviaDesktopStore");
    expect(shell).toContain("buildTabletNavigationUrl");
    expect(appContent).toContain("data-tablet-active-app");
  });
});
