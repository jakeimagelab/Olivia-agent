import { describe, expect, it } from "vitest";
import { createEventDeduplicationKey } from "@/lib/olivia/events";

describe("Olivia event deduplication", () => {
  it("creates stable normalized keys", () => {
    expect(createEventDeduplicationKey("workflow.started", " run 1 ", null, 2)).toBe("workflow.started:run_1:2");
  });
});
