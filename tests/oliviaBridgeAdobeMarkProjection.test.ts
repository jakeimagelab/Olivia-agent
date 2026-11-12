import { describe, expect, it } from "vitest";

import { projectAdobeBridgeMarks } from "@/lib/photo-bridge/adobeMarkProjection";

describe("projectAdobeBridgeMarks", () => {
  it("파일명 키를 JPG ID의 별점·컬러·선택과 RAW ID 표시로 한 번에 투영한다", () => {
    const projection = projectAdobeBridgeMarks(
      [
        { id: "jpg-a", name: "촬영/A_0001.JPG" },
        { id: "jpg-b", name: "A_0002.jpg" },
        { id: "jpg-c", name: "A_0003.JPG" },
      ],
      [{ id: "raw-a", name: "A_0001.CR3" }],
      new Map([
        ["a_0001", { rating: 5, colorLabel: 6 as const }],
        ["a_0002", { rating: null, colorLabel: 9 as const }],
      ]),
    );

    expect(projection.ratings).toEqual({ "jpg-a": 5 });
    expect(projection.colorLabels).toEqual({ "jpg-a": 6, "jpg-b": 9 });
    expect(projection.rawMarks).toEqual({ "raw-a": { rating: 5, colorLabel: 6 } });
    expect([...projection.selectedIds]).toEqual(["jpg-a", "jpg-b"]);
  });

  it("표시가 없는 파일은 결과에 추가하지 않는다", () => {
    const projection = projectAdobeBridgeMarks(
      [{ id: "jpg-a", name: "A_0001.JPG" }],
      [{ id: "raw-a", name: "A_0001.CR3" }],
      new Map(),
    );

    expect(projection).toEqual({ ratings: {}, colorLabels: {}, rawMarks: {}, selectedIds: new Set() });
  });
});
