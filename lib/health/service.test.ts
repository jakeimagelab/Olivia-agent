import { describe, expect, it } from "vitest";
import { evaluateHealthRules } from "./service";
import type { HealthContext, HealthRule } from "./rules";

const context = {
  db: {} as HealthContext["db"],
  now: new Date("2026-09-28T00:00:00.000Z"),
  diagnostics: { ok: true, checkedAt: "2026-09-28T00:00:00.000Z", issueCount: 0, summary: "ok", items: [] },
  deployedRevision: null,
} satisfies HealthContext;

describe("health rule execution", () => {
  it("one broken rule is recorded as unknown without skipping the remaining rules", async () => {
    const rules: HealthRule[] = [
      { id: "broken", label: "broken", group: "chat", severity: "error", check: async () => { throw new Error("boom"); } },
      { id: "healthy", label: "healthy", group: "data", severity: "warning", check: async () => ({ state: "ok", detail: "ok" }) },
    ];
    await expect(evaluateHealthRules({ context, rules })).resolves.toEqual([
      expect.objectContaining({ ruleId: "broken", state: "unknown" }),
      expect.objectContaining({ ruleId: "healthy", state: "ok" }),
    ]);
  });
});
