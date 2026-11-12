import { describe, expect, it } from "vitest";

import {
  isDeliveryCompatibilityError,
  latestSharedSelectionByReviewer,
  loadAdminPeople,
} from "@/lib/person-select/server/adminProjectRepository";

function peopleDb(results: Array<{ data: unknown[] | null; error: { message?: string; code?: string } | null }>) {
  const selectedFields: string[] = [];
  return {
    selectedFields,
    db: {
      from: () => ({
        select: (fields: string) => {
          selectedFields.push(fields);
          return {
            eq: () => ({
              order: async () => results.shift() ?? { data: [], error: null },
            }),
          };
        },
      }),
    },
  };
}

describe("person select admin repository", () => {
  it("falls back to legacy people fields only for missing delivery columns", async () => {
    const fixture = peopleDb([
      { data: null, error: { message: "delivery_state does not exist", code: "42703" } },
      { data: [{ id: "person-1" }], error: null },
    ]);

    const result = await loadAdminPeople(fixture.db as never, "event-1");

    expect(result.data).toEqual([{ id: "person-1" }]);
    expect(fixture.selectedFields).toHaveLength(2);
    expect(fixture.selectedFields[0]).toContain("delivery_state");
    expect(fixture.selectedFields[1]).not.toContain("delivery_state");
  });

  it("does not hide unrelated database errors behind the compatibility query", async () => {
    const fixture = peopleDb([
      { data: null, error: { message: "permission denied", code: "42501" } },
    ]);

    const result = await loadAdminPeople(fixture.db as never, "event-1");

    expect(result.error?.code).toBe("42501");
    expect(fixture.selectedFields).toHaveLength(1);
    expect(isDeliveryCompatibilityError(result.error)).toBe(false);
  });

  it("keeps the first selection for each reviewer from a newest-first list", () => {
    const selections = [
      { id: "new-a", reviewer_id: "a" },
      { id: "new-b", reviewer_id: "b" },
      { id: "old-a", reviewer_id: "a" },
    ];

    const latest = latestSharedSelectionByReviewer(selections);

    expect(latest.get("a")?.id).toBe("new-a");
    expect(latest.get("b")?.id).toBe("new-b");
  });
});
