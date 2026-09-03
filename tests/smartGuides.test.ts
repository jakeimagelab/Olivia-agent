import { describe, expect, it } from "vitest";
import { computeSnap } from "@/lib/reviewContent/smartGuides";

const CANVAS = { width: 1080, height: 1350 };

describe("computeSnap", () => {
  it("snaps to the canvas horizontal/vertical center when close enough", () => {
    const rect = { x: 437, y: 100, width: 200, height: 100 }; // centerX = 537, 3px off from 540
    const result = computeSnap(rect, CANVAS, [], 8);
    expect(result.x).toBe(440); // centerX corrected to exactly 540
    expect(result.guides.some((g) => g.type === "vertical" && g.position === 540)).toBe(true);
  });

  it("does not snap or show gap labels when far from every candidate", () => {
    const rect = { x: 400, y: 500, width: 100, height: 100 }; // far from every candidate and every canvas edge
    const result = computeSnap(rect, CANVAS, [], 8);
    expect(result.x).toBe(400);
    expect(result.y).toBe(500);
    expect(result.guides).toHaveLength(0);
  });

  it("snaps to another element's right edge", () => {
    const other = { x: 600, y: 0, width: 100, height: 100 }; // right edge at 700
    const rect = { x: 548, y: 0, width: 150, height: 100 }; // right edge at 698, 2px off
    const result = computeSnap(rect, CANVAS, [other], 8);
    expect(result.x).toBe(550); // right edge corrected to exactly 700
    expect(result.guides.some((g) => g.type === "vertical" && g.position === 700)).toBe(true);
  });

  it("respects the exact threshold boundary", () => {
    const other = { x: 0, y: 200, width: 50, height: 50 };
    const exact = computeSnap({ x: 0, y: 192, width: 50, height: 50 }, CANVAS, [other], 8); // delta exactly 8
    expect(exact.y).toBe(200);
    const tooFar = computeSnap({ x: 0, y: 191, width: 50, height: 50 }, CANVAS, [other], 8); // delta 9, beyond threshold
    expect(tooFar.y).toBe(191);
  });

  it("adds a gap label toward a nearby canvas edge without requiring a snap", () => {
    const rect = { x: 24, y: 500, width: 100, height: 100 };
    const result = computeSnap(rect, CANVAS, [], 2); // threshold too tight to trigger alignment snap
    const gap = result.guides.find((g) => g.label === "24");
    expect(gap).toBeTruthy();
  });
});
