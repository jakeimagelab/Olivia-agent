import { describe, expect, it } from "vitest";
import { computeSnapZone, resolveSnapBounds } from "@/components/olivia-os/window/snapZones";

const VW = 1440;
const VH = 900;

describe("computeSnapZone", () => {
  it("상단 40px 안이면 maximize", () => {
    expect(computeSnapZone(700, 10, VW, VH)).toBe("maximized");
  });

  it("왼쪽 엣지, 상단 1/3 → left-70", () => {
    expect(computeSnapZone(5, 100, VW, VH)).toBe("left-70");
  });

  it("왼쪽 엣지, 중간 1/3 → left-half", () => {
    expect(computeSnapZone(5, VH / 2, VW, VH)).toBe("left-half");
  });

  it("왼쪽 엣지, 하단 1/3 → left-30", () => {
    expect(computeSnapZone(5, VH - 50, VW, VH)).toBe("left-30");
  });

  it("오른쪽 엣지, 상단 1/3 → right-70", () => {
    expect(computeSnapZone(VW - 5, 100, VW, VH)).toBe("right-70");
  });

  it("오른쪽 엣지, 하단 1/3 → right-30", () => {
    expect(computeSnapZone(VW - 5, VH - 50, VW, VH)).toBe("right-30");
  });

  it("화면 중앙이면 null(스냅 힌트 없음)", () => {
    expect(computeSnapZone(700, 450, VW, VH)).toBeNull();
  });
});

describe("resolveSnapBounds", () => {
  const topBarHeight = 40;
  const dockSafeArea = 96;

  it("maximized는 전체 작업영역을 채운다", () => {
    const bounds = resolveSnapBounds("maximized", VW, VH, topBarHeight, dockSafeArea);
    expect(bounds).toEqual({ x: 12, y: 48, width: VW - 24, height: VH - dockSafeArea - 48 });
  });

  it("left-half/right-half는 정확히 절반씩 나눈다", () => {
    const left = resolveSnapBounds("left-half", VW, VH, topBarHeight, dockSafeArea);
    const right = resolveSnapBounds("right-half", VW, VH, topBarHeight, dockSafeArea);
    expect(left.width).toBe(right.width);
    expect(left.x).toBeLessThan(right.x);
    expect(left.x + left.width).toBeLessThanOrEqual(right.x + 1); // 거의 맞닿음(반올림 오차 허용)
  });

  it("left-70은 right-30보다 넓다", () => {
    const left70 = resolveSnapBounds("left-70", VW, VH, topBarHeight, dockSafeArea);
    const right30 = resolveSnapBounds("right-30", VW, VH, topBarHeight, dockSafeArea);
    expect(left70.width).toBeGreaterThan(right30.width);
  });

  it("right-70의 오른쪽 끝은 화면 오른쪽 여백과 맞는다", () => {
    const bounds = resolveSnapBounds("right-70", VW, VH, topBarHeight, dockSafeArea);
    expect(bounds.x + bounds.width).toBe(VW - 12);
  });
});
