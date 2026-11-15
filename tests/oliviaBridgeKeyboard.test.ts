import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { handleBridgeSelectAllShortcut } from "@/components/olivia-bridge/useOliviaBridgeKeyboard";

describe("Olivia Bridge keyboard", () => {
  it("selects every visible JPG with Command+A while Scene review is open", () => {
    const preventDefault = vi.fn();
    const selectAllVisibleJpgs = vi.fn();

    const context = handleBridgeSelectAllShortcut({
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      code: "KeyA",
      preventDefault,
    }, {
      toolKey: undefined,
      sceneReviewOpen: true,
      selectAllVisibleJpgs,
    });

    expect(context).toBe("scene_review");
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(selectAllVisibleJpgs).toHaveBeenCalledOnce();
  });

  it("keeps tool windows authoritative and leaves typing targets ahead of select-all handling", () => {
    const selectAllVisibleJpgs = vi.fn();
    const context = handleBridgeSelectAllShortcut({
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      code: "KeyA",
      preventDefault: vi.fn(),
    }, {
      toolKey: "classification",
      sceneReviewOpen: true,
      selectAllVisibleJpgs,
    });
    const source = readFileSync("components/olivia-bridge/useOliviaBridgeKeyboard.ts", "utf8");

    expect(context).toBeNull();
    expect(selectAllVisibleJpgs).not.toHaveBeenCalled();
    expect(source.indexOf("if (isTypingTarget(event.target)) return;")).toBeLessThan(
      source.indexOf("handleBridgeSelectAllShortcut(event"),
    );
  });

  it("recomputes selected Scene analysis when selectedIds changes", () => {
    const source = readFileSync("components/olivia-bridge/useOliviaBridgeSceneReviewModel.ts", "utf8");
    expect(source).toContain("[sceneReviewOpen, sceneState.analysis, selectedIds]");
  });
});
