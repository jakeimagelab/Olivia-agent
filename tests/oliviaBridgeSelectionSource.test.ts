import { describe, expect, it } from "vitest";

import { resolveBridgeColorLabels, resolveBridgeRatings } from "@/lib/photo-bridge/labels";
import {
  DEFAULT_BRIDGE_SELECTION_SOURCE,
  normalizeBridgeSelectionSource,
  resolveBridgeSelection,
} from "@/lib/photo-bridge/toolLinkage";

describe("Olivia Bridge selection source", () => {
  const manual = new Set(["manual", "shared"]);
  const adobe = new Set(["adobe", "shared", "removed"]);
  const removed = new Set(["removed"]);

  it("uses only the selected source and honors manual removals in both mode", () => {
    expect([...resolveBridgeSelection("olivia", manual, adobe, removed)].sort()).toEqual(["manual", "shared"]);
    expect([...resolveBridgeSelection("adobe", manual, adobe, removed)].sort()).toEqual(["adobe", "removed", "shared"]);
    expect([...resolveBridgeSelection("both", manual, adobe, removed)].sort()).toEqual(["adobe", "manual", "shared"]);
  });

  it("ignores Adobe ratings for Olivia and keeps Adobe merge rules otherwise", () => {
    const base = { manual: 2, shared: 1 };
    const adobeRatings = { adobe: 4, shared: 5 };
    const edits = { adobe: 3, shared: 0 } as const;

    expect(resolveBridgeRatings("olivia", base, adobeRatings, {})).toEqual(base);
    expect(resolveBridgeRatings("adobe", base, adobeRatings, {})).toEqual({ manual: 2, adobe: 4, shared: 5 });
    expect(resolveBridgeRatings("both", base, adobeRatings, {})).toEqual({ manual: 2, adobe: 4, shared: 5 });
    expect(resolveBridgeRatings("olivia", base, adobeRatings, edits)).toEqual({ manual: 2, adobe: 3 });
    expect(resolveBridgeRatings("adobe", base, adobeRatings, edits)).toEqual({ manual: 2, adobe: 3 });
    expect(resolveBridgeRatings("both", base, adobeRatings, edits)).toEqual({ manual: 2, adobe: 3 });
  });

  it("defaults missing or invalid stored values to Olivia", () => {
    expect(DEFAULT_BRIDGE_SELECTION_SOURCE).toBe("olivia");
    expect(normalizeBridgeSelectionSource(null)).toBe("olivia");
    expect(normalizeBridgeSelectionSource("unknown")).toBe("olivia");
    expect(normalizeBridgeSelectionSource("adobe")).toBe("adobe");
  });

  it("컬러 기준별로 올리비아·어도비 값을 같은 우선순위로 합친다", () => {
    const base = { manual: 6, shared: 8 } as const;
    const adobe = { adobe: 7, shared: 9 } as const;

    expect(resolveBridgeColorLabels("olivia", base, adobe)).toEqual(base);
    expect(resolveBridgeColorLabels("adobe", base, adobe)).toEqual(adobe);
    expect(resolveBridgeColorLabels("both", base, adobe)).toEqual({ adobe: 7, shared: 8, manual: 6 });
  });
});
