import { describe, expect, it } from "vitest";

import {
  countCustomerSelection,
  customerSelectionIds,
  isCustomerColorLabel,
  isCustomerRating,
  isCustomerSelection,
  normalizeCustomerColorLabel,
  normalizeCustomerRating,
} from "@/lib/person-select/customerSelection";

describe("canonical customer selection values", () => {
  it("accepts only numeric ratings 1-5 and color labels 6-9", () => {
    expect([1, 2, 3, 4, 5].every(isCustomerRating)).toBe(true);
    expect([6, 7, 8, 9].every(isCustomerColorLabel)).toBe(true);
    expect([0, 6, "5", NaN, null].some(isCustomerRating)).toBe(false);
    expect([5, 10, "6", NaN, null].some(isCustomerColorLabel)).toBe(false);
  });

  it("normalizes invalid marks to null without coercing strings", () => {
    expect(normalizeCustomerRating(5)).toBe(5);
    expect(normalizeCustomerRating("5")).toBeNull();
    expect(normalizeCustomerColorLabel(8)).toBe(8);
    expect(normalizeCustomerColorLabel("8")).toBeNull();
  });

  it("uses the same rule for single values, counts, and selected id sets", () => {
    const values = [
      { id: "legacy", selected: true },
      { id: "rated", rating: 3 },
      { id: "colored", colorLabel: 7 },
      { id: "both", rating: 5, colorLabel: 9 },
      { id: "none", rating: 0, colorLabel: null },
    ];

    expect(values.map((value) => isCustomerSelection(value))).toEqual([true, true, true, true, false]);
    expect(countCustomerSelection(values)).toBe(4);
    expect(customerSelectionIds({
      selectedImageIds: ["legacy"],
      ratings: { rated: 3, both: 5, invalid: 6 },
      colorLabels: { colored: 7, both: 9, invalid: 5 },
    })).toEqual(new Set(["legacy", "rated", "both", "colored"]));
  });
});
