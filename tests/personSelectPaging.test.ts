import { describe, expect, it } from "vitest";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";
import { firstPersonSelectImageByCategory, firstPersonSelectImageByOwner } from "@/lib/person-select/matching";

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

describe("person select matching representatives", () => {
  it("keeps every person and chooses only the earliest uploaded image", () => {
    const images = [
      { id: "b", owner_person_id: "person-a", category_key: "photo", original_file_name: "A2.JPG", source_rel_path: "가/A2.JPG", thumb_path: "a2.jpg", sort_order: 2 },
      { id: "a", owner_person_id: "person-a", category_key: "photo", original_file_name: "A1.JPG", source_rel_path: "가/A1.JPG", thumb_path: "a1.jpg", sort_order: 1 },
      { id: "c", owner_person_id: "person-b", category_key: "photo", original_file_name: "B1.JPG", source_rel_path: "나/B1.JPG", thumb_path: "b1.jpg", sort_order: 0 },
      { id: "d", owner_person_id: null, category_key: "homeroom", original_file_name: "GROUP.JPG", source_rel_path: "그룹/GROUP.JPG", thumb_path: "group.jpg", sort_order: 0 },
    ];

    const representatives = firstPersonSelectImageByOwner(images);
    expect([...representatives.keys()]).toEqual(["person-a", "person-b"]);
    expect(representatives.get("person-a")?.original_file_name).toBe("A1.JPG");
    expect(representatives.get("person-b")?.original_file_name).toBe("B1.JPG");
  });

  it("keeps a separate representative for each category in the progress table", () => {
    const representatives = firstPersonSelectImageByCategory([
      { id: "p", owner_person_id: "person-a", category_key: "profile", original_file_name: "PROFILE.JPG", source_rel_path: "프로필/PROFILE.JPG", thumb_path: "profile.jpg", sort_order: 0 },
      { id: "h", owner_person_id: "person-a", category_key: "homeroom", original_file_name: "CLASS.JPG", source_rel_path: "담임/CLASS.JPG", thumb_path: "class.jpg", sort_order: 0 },
    ]);
    expect(representatives.get("person-a\u0000profile")?.original_file_name).toBe("PROFILE.JPG");
    expect(representatives.get("person-a\u0000homeroom")?.original_file_name).toBe("CLASS.JPG");
  });
});
