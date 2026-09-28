import { describe, expect, it } from "vitest";
import { hasRepeatedClientSuffix, HEALTH_RULES } from "./index";

describe("health rule helpers", () => {
  it("detects the repeated client suffix from the 2026-09-27 incident", () => {
    expect(hasRepeatedClientSuffix("여의도기통찬의원의원")).toBe(true);
    expect(hasRepeatedClientSuffix("여의도기통찬의원")).toBe(false);
  });

  it("keeps the incident rule catalog in one place", () => {
    expect(HEALTH_RULES.map((rule) => rule.id)).toEqual(expect.arrayContaining([
      "worker_openai_key", "worker_script_stale", "worker_offline", "watcher_stalled", "process_restart_storm", "log_growth",
      "false_completion_claim", "forced_tool_mismatch", "execution_unverified", "hermes_timeout_rate",
      "duplicate_documents", "name_suffix_repeat", "orphan_workflow", "migration_missing", "worker_rev_mismatch",
    ]));
  });
});
