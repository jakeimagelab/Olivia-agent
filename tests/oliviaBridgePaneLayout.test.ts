import { describe, expect, it } from "vitest";

import {
  BRIDGE_PANE_DEFAULT_WIDTH,
  bridgeCenterMinimum,
  bridgePaneWidthFromPointer,
  clampBridgePaneWidth,
} from "@/lib/photo-bridge/paneLayout";

describe("Olivia Bridge resizable panes", () => {
  it("keeps the file browser wider by default", () => {
    expect(BRIDGE_PANE_DEFAULT_WIDTH).toEqual({ folder: 210, preview: 300 });
    expect(1440 - BRIDGE_PANE_DEFAULT_WIDTH.folder - BRIDGE_PANE_DEFAULT_WIDTH.preview - 18).toBe(912);
  });

  it("clamps each side pane while reserving the center browser", () => {
    expect(clampBridgePaneWidth({ pane: "folder", requestedWidth: 500, containerWidth: 1200, oppositePaneWidth: 300 })).toBe(360);
    expect(clampBridgePaneWidth({ pane: "preview", requestedWidth: 700, containerWidth: 900, oppositePaneWidth: 170 })).toBe(392);
    expect(clampBridgePaneWidth({ pane: "preview", requestedWidth: 80, containerWidth: 1200, oppositePaneWidth: 210 })).toBe(240);
  });

  it("uses a smaller center safety width only for compact desktop windows", () => {
    expect(bridgeCenterMinimum(979)).toBe(320);
    expect(bridgeCenterMinimum(980)).toBe(420);
  });

  it("turns divider pointer positions into the matching pane width", () => {
    expect(bridgePaneWidthFromPointer({ pane: "folder", pointerX: 280, containerLeft: 50, containerRight: 1250 })).toBe(230);
    expect(bridgePaneWidthFromPointer({ pane: "preview", pointerX: 910, containerLeft: 50, containerRight: 1250 })).toBe(340);
  });
});
