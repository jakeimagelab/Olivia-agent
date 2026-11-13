import { describe, expect, it } from "vitest";
import {
  workerBooleanValue,
  workerNumberValue,
  workerStringArrayValue,
  workerStringValue,
} from "@/lib/remote-jobs/workerPayload";

describe("Mac Studio worker payload values", () => {
  it("reads optional and required strings", () => {
    expect(workerStringValue({ path: "촬영/프로젝트" }, "path", true)).toBe("촬영/프로젝트");
    expect(workerStringValue({}, "path")).toBeUndefined();
    expect(() => workerStringValue({}, "path", true)).toThrow("path 값이 필요");
    expect(() => workerStringValue({ path: 1 }, "path")).toThrow("문자열");
  });

  it("reads finite numbers and booleans without coercion", () => {
    expect(workerNumberValue({ count: 3 }, "count")).toBe(3);
    expect(workerBooleanValue({ enabled: false }, "enabled")).toBe(false);
    expect(() => workerNumberValue({ count: Number.NaN }, "count")).toThrow("숫자");
    expect(() => workerBooleanValue({ enabled: 0 }, "enabled")).toThrow("boolean");
  });

  it("accepts only string arrays", () => {
    expect(workerStringArrayValue({ names: ["A.JPG", "B.JPG"] }, "names")).toEqual(["A.JPG", "B.JPG"]);
    expect(() => workerStringArrayValue({ names: ["A.JPG", 2] }, "names")).toThrow("문자열 배열");
  });
});
