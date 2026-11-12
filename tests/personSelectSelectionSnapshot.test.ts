import { describe, expect, it } from "vitest";

import {
  customerSelectionSnapshotFromRows,
  normalizeCustomerSelectionSnapshot,
} from "@/lib/person-select/domain/selectionSnapshot";

describe("person selection snapshot adapters", () => {
  it("builds one canonical snapshot from shared draft rows", () => {
    const snapshot = customerSelectionSnapshotFromRows({
      revision: 4,
      rows: [
        { image_id: "legacy", customer_rating: null, customer_color_label: null, memo: "" },
        { image_id: "rated", customer_rating: 5, memo: "피부 정리" },
        { image_id: "colored", customer_color_label: 7 },
        { image_id: "invalid", customer_rating: 8, customer_color_label: 3 },
      ],
      customerMemo: "전체 메모",
      updatedAt: "2026-11-12T00:00:00.000Z",
    });

    expect(snapshot).toEqual({
      revision: 4,
      selectedImageIds: ["legacy", "rated", "colored", "invalid"],
      ratings: { rated: 5 },
      colorLabels: { colored: 7 },
      imageNotes: { rated: "피부 정리" },
      customerMemo: "전체 메모",
      updatedAt: "2026-11-12T00:00:00.000Z",
    });
  });

  it("filters every snapshot map through the same allowed image ids", () => {
    const normalized = normalizeCustomerSelectionSnapshot({
      revision: 2,
      selectedImageIds: ["keep", "drop"],
      ratings: { keep: 4, drop: 5, invalid: 8 },
      colorLabels: { keepColor: 6, drop: 9, invalid: 2 },
      imageNotes: { keep: "메모", drop: "제외", unknown: "제외" },
      customerMemo: "유지",
      updatedAt: null,
    }, new Set(["keep", "keepColor"]));

    expect(normalized.selectedImageIds).toEqual(["keep", "keepColor"]);
    expect(normalized.ratings).toEqual({ keep: 4 });
    expect(normalized.colorLabels).toEqual({ keepColor: 6 });
    expect(normalized.imageNotes).toEqual({ keep: "메모" });
    expect(normalized.customerMemo).toBe("유지");
  });
});
