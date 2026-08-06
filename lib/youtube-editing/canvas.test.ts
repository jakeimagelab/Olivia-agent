import { describe, expect, it } from "vitest";
import { polygonContainsPoint, strokeIntersectsPoint, strokeIntersectsPolygon } from "./canvas";
import type { Stroke } from "./types";

const horizontalStroke: Stroke = {
  id: "s1",
  tool: "pen",
  color: "#111111",
  width: 3,
  points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }],
};

describe("strokeIntersectsPoint", () => {
  it("지우개 경로가 획 위를 지나가면 교차로 판정한다", () => {
    // width=1000 캔버스에서 y=0.5 라인 위의 점(500,500)은 획(200,500)~(800,500) 선분 위에 있다.
    expect(strokeIntersectsPoint(horizontalStroke, 0.5, 0.5, 1000, 1000, 10)).toBe(true);
  });

  it("반경 밖의 점은 교차하지 않는다", () => {
    expect(strokeIntersectsPoint(horizontalStroke, 0.5, 0.9, 1000, 1000, 10)).toBe(false);
  });

  it("반경 안쪽이면 선분에서 살짝 벗어나도 교차로 판정한다", () => {
    expect(strokeIntersectsPoint(horizontalStroke, 0.5, 0.505, 1000, 1000, 10)).toBe(true);
  });

  it("점이 하나뿐인 획은 선분이 없어 교차하지 않는다", () => {
    const singlePoint: Stroke = { id: "s2", tool: "pen", color: "#000", width: 3, points: [{ x: 0.5, y: 0.5 }] };
    expect(strokeIntersectsPoint(singlePoint, 0.5, 0.5, 1000, 1000, 10)).toBe(false);
  });
});

const square = [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.6, y: 0.6 }, { x: 0.2, y: 0.6 }];

describe("polygonContainsPoint", () => {
  it("사각형 내부의 점을 포함으로 판정한다", () => {
    expect(polygonContainsPoint(square, 0.4, 0.4)).toBe(true);
  });

  it("사각형 밖의 점은 포함하지 않는다", () => {
    expect(polygonContainsPoint(square, 0.9, 0.9)).toBe(false);
  });
});

describe("strokeIntersectsPolygon", () => {
  it("올가미 폐곡선 안에 획의 점이 있으면 겹친 것으로 본다", () => {
    const insideStroke: Stroke = { id: "s4", tool: "pen", color: "#000", width: 3, points: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }] };
    expect(strokeIntersectsPolygon(insideStroke, square)).toBe(true);
  });

  it("점이 3개 미만인 폐곡선은 겹치지 않는 것으로 본다", () => {
    expect(strokeIntersectsPolygon(horizontalStroke, [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 }])).toBe(false);
  });

  it("폐곡선과 완전히 떨어진 획은 겹치지 않는다", () => {
    const farStroke: Stroke = { id: "s3", tool: "pen", color: "#000", width: 3, points: [{ x: 0.9, y: 0.9 }, { x: 0.95, y: 0.95 }] };
    expect(strokeIntersectsPolygon(farStroke, square)).toBe(false);
  });
});
