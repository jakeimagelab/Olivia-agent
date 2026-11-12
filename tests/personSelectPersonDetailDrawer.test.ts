import { describe, expect, it } from "vitest";
import { toggleRetouchKey } from "@/components/person-select/admin/PersonDetailDrawer";

describe("person select person detail drawer", () => {
  it("adds and removes a retouch key without mutating the current list", () => {
    const current = ["skin"];

    expect(toggleRetouchKey(current, "body")).toEqual(["skin", "body"]);
    expect(toggleRetouchKey(current, "skin")).toEqual([]);
    expect(current).toEqual(["skin"]);
  });
});
