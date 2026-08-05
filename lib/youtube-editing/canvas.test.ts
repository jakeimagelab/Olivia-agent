import { describe, expect, it } from "vitest";
import { strokeIntersectsPoint } from "./canvas";
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
