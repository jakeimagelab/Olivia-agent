import { describe, expect, it } from "vitest";

import { loadPersonSelectRawMatchTargets } from "@/lib/person-select/node/rawMatchTargets";

type Row = Record<string, unknown>;

function pagingDb(tables: Record<string, Row[]>) {
  const ranges: Record<string, Array<[number, number]>> = {};
  return {
    ranges,
    db: {
      from(table: string) {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          in() { return chain; },
          order() { return chain; },
          range(from: number, to: number) {
            (ranges[table] ??= []).push([from, to]);
            return Promise.resolve({
              data: (tables[table] ?? []).slice(from, to + 1),
              error: null,
            });
          },
        };
        return chain;
      },
    },
  };
}

describe("person select RAW target loader", () => {
  it("loads all 2,500 individual choices instead of stopping at 1,000", async () => {
    const choices = Array.from({ length: 2_500 }, (_, index) => ({
      person_id: "person-1",
      image_id: `image-${index}`,
      updated_at: "2026-11-13T00:00:00.000Z",
      person_select_images: {
        id: `image-${index}`,
        original_file_name: `PHOTO_${index}.JPG`,
        source_rel_path: `홍길동/PHOTO_${index}.JPG`,
      },
    }));
    const { db, ranges } = pagingDb({
      person_select_people: [{
        id: "person-1",
        display_name: "홍길동",
        submitted_at: null,
      }],
      person_select_choices: choices,
    });

    const result = await loadPersonSelectRawMatchTargets({
      db: db as never,
      eventId: "event-1",
      accessMode: "individual_pin",
      source: "current",
    });

    expect(result.targets).toHaveLength(2_500);
    expect(result.targets.at(-1)?.originalFileName).toBe("PHOTO_2499.JPG");
    expect(ranges.person_select_choices).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_999],
    ]);
  });
});
