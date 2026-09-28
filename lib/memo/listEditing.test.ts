import { describe, expect, it } from "vitest";
import { applyAutoBullet, changeIndent, continueList } from "@/lib/memo/listEditing";

describe("memo list editing", () => {
  it.each([
    ["- ", "• "],
    ["* ", "• "],
    ["[] ", "☐ "],
  ])("converts %s at a line start", (input, expected) => {
    expect(applyAutoBullet(input, input.length)).toEqual({ text: expected, cursor: expected.length });
  });

  it("does not convert a hyphen away from the line start", () => {
    expect(applyAutoBullet("안녕 - 하세요", "안녕 - 하세요".length)).toEqual({ text: "안녕 - 하세요", cursor: "안녕 - 하세요".length });
  });

  it.each([
    ["• 촬영 준비", "• "],
    ["  ◦ 조명", "  ◦ "],
    ["1. 첫째", "2. "],
    ["• ", ""],
  ])("continues list lines", (line, expected) => {
    expect(continueList(line)).toBe(expected);
  });

  it.each([
    ["• 항목", 1, "  ◦ 항목"],
    ["  ◦ 항목", -1, "• 항목"],
    ["• 항목", -1, "항목"],
    ["    ▪ 항목", 1, "    ▪ 항목"],
  ] as const)("changes indentation", (line, direction, expected) => {
    expect(changeIndent(line, direction)).toBe(expected);
  });
});
