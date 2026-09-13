import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveOliviaSurface, shouldUseOliviaMobileSurface } from "@/lib/olivia/mobile/adaptiveSurface";
import { buildTabletNavigationUrl, parseTabletNavigation, parseTabletNavigationState } from "@/lib/olivia/tablet/navigation";
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

  it("keeps the selected Conti inside Tablet navigation", () => {
    const href = buildTabletNavigationUrl(
      "https://olivia.photoclinic.kr/?tabletPreview=1",
      "conti",
      { resourceId: "conti-run-123", clientId: "client-7" },
    );
    const state = parseTabletNavigationState(new URL(href, "https://olivia.photoclinic.kr").search);
    expect(state).toEqual({ app: "conti", resourceId: "conti-run-123", clientId: "client-7", workflowRunId: undefined });
    expect(href).not.toContain("/conti?");
  });

  it("uses registry icons where the Desktop app exists and shared Olivia icons otherwise", () => {
    expect(resolveTabletAppIconSource("calendar")).toEqual({ kind: "registry", appId: "calendar" });
    expect(resolveTabletAppIconSource("conti")).toEqual({ kind: "registry", appId: "conti" });
    expect(resolveTabletAppIconSource("customer")).toEqual({ kind: "registry", appId: "customer" });
    expect(resolveTabletAppIconSource("channel-analysis")).toEqual({ kind: "shared", iconName: "channel-analysis" });
    expect(TABLET_APPS.map((app) => app.id)).toEqual([
      "home", "customer", "calendar", "conti", "documents", "olivia-chat", "review-studio", "memo", "quote-contract",
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

  it("uses a fixed-size scrollable Dock and a compact one-screen Home", () => {
    const css = readFileSync("components/olivia-tablet/OliviaTabletShell.module.css", "utf8");
    const home = readFileSync("components/olivia-tablet/TabletHome.tsx", "utf8");
    expect(css).toMatch(/\.dockButtonActive\s*\{[^}]*background:\s*transparent/);
    expect(css).toMatch(/\.dockIndicator\s*\{[^}]*var\(--olivia-orange\)/);
    expect(css).toMatch(/\.dockScroll\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.dockScroll\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.dockButton\s*\{[^}]*flex:\s*0 0 66px/);
    expect(css).toMatch(/\.dockLabel\s*\{[^}]*font-size:\s*10px/);
    expect(css).toMatch(/\.homeScroll\s*\{[^}]*overflow:\s*hidden/);
    expect(home).toContain("좋은 하루예요.");
    expect(home).toContain('onNavigate("conti")');
    expect(home).not.toContain('window.location.href = "/conti"');
  });

  it("renders one Tablet header and the real workspace without a second Hero", () => {
    const topBar = readFileSync("components/olivia-tablet/TabletTopBar.tsx", "utf8");
    const frame = readFileSync("components/olivia-tablet/TabletAppFrame.tsx", "utf8");
    const css = readFileSync("components/olivia-tablet/OliviaTabletShell.module.css", "utf8");
    expect(topBar).toContain('/assets/photoclinic-mark.png');
    expect(topBar).not.toContain("TABLET");
    expect(frame).toContain("data-tablet-app-frame");
    expect(frame).not.toContain("unifiedHero");
    expect(frame).not.toContain("OLIVIA TABLET");
    expect(css).toMatch(/\.appViewport\s*\{[^}]*top:\s*calc\(64px/);
    expect(css).toMatch(/\.appViewport\s*\{[^}]*bottom:\s*calc\(88px/);
    expect(css).toMatch(/\.appViewport\s*\{[^}]*border-radius:\s*0/);
  });

  it("keeps Tablet workspace density separate from Desktop mode", () => {
    const shell = readFileSync("components/olivia-tablet/OliviaTabletShell.tsx", "utf8");
    const appContent = readFileSync("components/olivia-tablet/TabletAppContent.tsx", "utf8");
    const clientsAdapter = readFileSync("components/olivia-os/adapters/ClientsWindowContent.tsx", "utf8");
    const photoRemote = readFileSync("components/olivia-tablet/TabletPhotoRemote.tsx", "utf8");
    expect(shell).toContain('OliviaUiSurfaceProvider value="tablet"');
    expect(appContent).toContain("<TabletClients />");
    expect(clientsAdapter).toContain("useOliviaUiSurface");
    expect(clientsAdapter).toContain('value={resolvedSurface === "desktop"}');
    expect(photoRemote).toContain("연결 준비 중");
    expect(photoRemote).not.toContain("setConnected");
    expect(photoRemote).not.toContain("UI PREVIEW");
  });

  it("assigns one explicit scroll owner to long Tablet workspaces", () => {
    const appContent = readFileSync("components/olivia-tablet/TabletAppContent.tsx", "utf8");
    const frame = readFileSync("components/olivia-tablet/TabletAppFrame.tsx", "utf8");
    const css = readFileSync("components/olivia-tablet/OliviaTabletShell.module.css", "utf8");
    const review = readFileSync("components/reviews/ReviewStoryWorkspace.tsx", "utf8");

    expect(frame).toContain('scroll?: "contained" | "page"');
    expect(appContent).toContain('<TabletAppFrame compact scroll="page">');
    expect(css).toMatch(/\.tabletAppFramePage\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.segmentContent\s*\{[^}]*overflow-y:\s*auto/);
    expect(review).toContain("useOliviaUiSurface");
    expect(review).toContain("node.parentElement?.clientHeight");
  });
});
