import { describe, expect, it } from "vitest";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";

describe("person select Supabase paging", () => {
  it("reads every row beyond the 1000 row response limit", async () => {
    const source = Array.from({ length: 3_360 }, (_, id) => ({ id }));
    const ranges: [number, number][] = [];
    const rows = await readAllPersonSelectRows(async (from, to) => {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null };
    });

    expect(rows).toHaveLength(3_360);
    expect(rows.at(-1)).toEqual({ id: 3_359 });
    expect(ranges).toEqual([[0, 999], [1_000, 1_999], [2_000, 2_999], [3_000, 3_999]]);
  });

  it("stops and reports a later page error", async () => {
    await expect(readAllPersonSelectRows(async (from) => from === 0
      ? { data: Array.from({ length: 1_000 }, (_, id) => ({ id })), error: null }
      : { data: null, error: { message: "두 번째 페이지 실패" } }))
      .rejects.toThrow("두 번째 페이지 실패");
  });
});
