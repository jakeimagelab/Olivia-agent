import { describe, expect, it } from "vitest";
import { togglePersonSelectRetouchKey } from "@/lib/person-select/adminWorkspace";

describe("person select person detail drawer", () => {
  it("adds and removes a retouch key without mutating the current list", () => {
    const current = ["skin"];

    expect(togglePersonSelectRetouchKey(current, "body")).toEqual(["skin", "body"]);
    expect(togglePersonSelectRetouchKey(current, "skin")).toEqual([]);
    expect(current).toEqual(["skin"]);
  });
});
