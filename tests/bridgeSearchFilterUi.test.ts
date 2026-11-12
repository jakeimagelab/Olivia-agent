import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminBridge = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
const adminFolderPanel = readFileSync("components/olivia-bridge/OliviaBridgeFolderPanel.tsx", "utf8");
const adminActionBar = readFileSync("components/olivia-bridge/OliviaBridgeActionBar.tsx", "utf8");
const adminBrowserPanel = readFileSync("components/olivia-bridge/OliviaBridgeBrowserPanel.tsx", "utf8");
const adminFilters = readFileSync("components/olivia-bridge/useOliviaBridgeFilters.ts", "utf8");
const adminBridgeUi = `${adminBridge}\n${adminActionBar}\n${adminBrowserPanel}\n${adminFilters}`;
const customerBridge = readFileSync("components/select-gallery/CustomerBridgeSelect.tsx", "utf8");
const customerBrowserPanel = readFileSync("components/select-gallery/CustomerBridgeBrowserPanel.tsx", "utf8");
const customerFolderPanel = readFileSync("components/select-gallery/CustomerBridgeFolderPanel.tsx", "utf8");
const customerFilters = readFileSync("components/select-gallery/useCustomerBridgeFilters.ts", "utf8");
const customerBridgeUi = `${customerBridge}\n${customerBrowserPanel}\n${customerFilters}`;
const adminCss = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.module.css", "utf8");
const customerCss = readFileSync("components/select-gallery/CustomerBridgeSelect.module.css", "utf8");
const shortcutHook = readFileSync("lib/photo-bridge/useBridgeSearchFilterShortcuts.ts", "utf8");
const customerPhotoView = readFileSync("lib/select-gallery/customerBridgeView.ts", "utf8");
const customerKeyboard = readFileSync("components/select-gallery/useCustomerBridgeKeyboard.ts", "utf8");
const adminKeyboard = readFileSync("components/olivia-bridge/useOliviaBridgeKeyboard.ts", "utf8");
const adminPhotoView = readFileSync("components/olivia-bridge/useOliviaBridgeVisibleFiles.ts", "utf8");

describe("Bridge filename search and shared label shortcuts", () => {
  it("wires the same search and shortcut hook into both Bridge screens", () => {
    for (const source of [adminBridgeUi, customerBridgeUi]) {
      expect(source).toContain("useBridgeSearchFilterShortcuts");
      expect(source).toContain('type="search"');
      expect(source).toContain('aria-label="파일명 검색"');
      expect(source).toContain("⌥⌘숫자 필터 · ⌥⌘A 전체 · ⌘F 검색");
    }
    expect(adminBridge).toContain("useOliviaBridgeVisibleFiles");
    expect(adminPhotoView).toContain("matchesBridgeFilenameSearch");
    expect(adminPhotoView).toContain("matchesBridgeLabelFilters");
    expect(customerBridge).toContain("buildCustomerBridgePhotoView");
    expect(customerPhotoView).toContain("matchesBridgeFilenameSearch");
    expect(customerPhotoView).toContain("matchesBridgeLabelFilters");
  });

  it("does not pass number keys from an editable search field to rating shortcuts", () => {
    const editableGuard = shortcutHook.indexOf("if (isEditableTarget(event.target)) return false");
    const labelShortcut = shortcutHook.indexOf("bridgeLabelFilterCommandFromShortcutCode(event.code)");

    expect(editableGuard).toBeGreaterThan(0);
    expect(labelShortcut).toBeGreaterThan(editableGuard);
    expect(adminKeyboard.indexOf("handleSearchFilterShortcut(event)")).toBeLessThan(adminKeyboard.indexOf("if (isTypingTarget(event.target)) return"));
    expect(adminFilters).toContain("handleUnfocusedBridgeShortcut");
    expect(customerBridge).toContain("useCustomerBridgeKeyboard");
    expect(customerKeyboard.indexOf("handleSearchFilterShortcut(event)")).toBeLessThan(customerKeyboard.indexOf("event.isComposing || isTypingTarget(event.target)"));
  });

  it("keeps folder statistics outside the independently scrolling list", () => {
    for (const source of [adminFolderPanel, customerFolderPanel]) {
      expect(source.indexOf("styles.folderPanelScroll")).toBeGreaterThan(0);
      expect(source.indexOf("styles.folderSummary")).toBeGreaterThan(source.indexOf("styles.folderPanelScroll"));
    }
    expect(adminCss).toMatch(/\.folderPanel\s*\{[\s\S]*grid-template-rows:[^;]*minmax\(0,\s*1fr\)[^;]*auto/);
    expect(customerCss).toMatch(/\.folderPanel\s*\{[\s\S]*grid-template-rows:[^;]*minmax\(0,\s*1fr\)[^;]*auto/);
    expect(adminCss).toMatch(/\.folderPanelScroll\s*\{[^}]*overflow-y:\s*auto/);
    expect(customerCss).toMatch(/\.folderPanelScroll\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("keeps the customer mobile footer above the safe area", () => {
    expect(customerCss).toMatch(/\.footer\s*\{[\s\S]*safe-area-inset-bottom/);
    expect(customerCss).toContain(".browserPanel:has(.browserActions)");
  });
});
