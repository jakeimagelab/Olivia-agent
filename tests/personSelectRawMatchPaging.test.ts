import { describe, expect, it } from "vitest";

import { fetchAllRowsByIdChunks } from "@/lib/person-select/rawMatchPaging";

describe("개인별 셀렉 RAW 매칭 대량 조회", () => {
  it("사진 2,500장을 ID 200개 이하와 페이지 단위로 나눠 누락 없이 읽는다", async () => {
    const ids = Array.from({ length: 2_500 }, (_, index) => `image-${String(index + 1).padStart(4, "0")}`);
    const calls: Array<{ ids: readonly string[]; from: number; to: number }> = [];
    const rows = await fetchAllRowsByIdChunks(ids, async (chunk, from, to) => {
      calls.push({ ids: [...chunk], from, to });
      const page = chunk.slice(from, to + 1).map((id) => ({ id }));
      return { data: page, error: null };
    }, 200);

    expect(rows.map((row) => row.id)).toEqual(ids);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2_500);
    expect(Math.max(...calls.map((call) => call.ids.length))).toBeLessThanOrEqual(200);
  });
});
