import { describe, expect, it } from "vitest";
import { getRequiredDockWidth, resolveDockLayout } from "@/components/olivia-os/dockLayout";

describe("Olivia Desktop responsive Dock", () => {
  it("keeps 48px icons when the full Dock fits", () => {
    expect(resolveDockLayout(1440, 11)).toEqual({ iconSize: 48, scrollable: false });
  });

  it("steps down to 40px before using the smallest size", () => {
    const width = getRequiredDockWidth(40, 11) / 0.9;
    expect(resolveDockLayout(width, 11)).toEqual({ iconSize: 40, scrollable: false });
  });

  it("steps down to 34px when 40px icons no longer fit", () => {
    const width = getRequiredDockWidth(34, 11) / 0.9;
    expect(resolveDockLayout(width, 11)).toEqual({ iconSize: 34, scrollable: false });
  });

  it("enables scrolling only when the 34px Dock cannot fit", () => {
    expect(resolveDockLayout(420, 11)).toEqual({ iconSize: 34, scrollable: true });
  });

  it("accounts for dynamically running apps", () => {
    expect(resolveDockLayout(720, 11).iconSize).toBe(40);
    expect(resolveDockLayout(720, 14).iconSize).toBe(34);
  });
});
