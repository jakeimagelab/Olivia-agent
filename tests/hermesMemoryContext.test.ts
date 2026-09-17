import { describe, expect, it } from "vitest";
import { formatHermesMemoryBlock, toHermesMemoryEntry } from "@/lib/olivia/memory/format";
import { buildHermesSystemPrompt } from "@/lib/hermes/systemPrompt";
import type { OliviaMemoryRow } from "@/lib/olivia/memory/types";

function memoryRow(overrides: Partial<OliviaMemoryRow> = {}): OliviaMemoryRow {
  return {
    id: "mem-1",
    memory_type: "business_rule",
    key: "quote_auto_client_project_creation",
    value: { ifClientMissing: "create_client_from_request" },
    scope: "quote",
    priority: 50,
    confidence: 1,
    source: "user_teaching",
    source_message_id: null,
    usage_count: 0,
    success_count: 0,
    failure_count: 0,
    is_active: true,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

// Olivia OS 2.0 — Hermes Chat Intelligence Upgrade §2/§3.
describe("Hermes Memory context", () => {
  it("TEST 11 — approved 규칙은 status=approved로 변환한다", () => {
    const entry = toHermesMemoryEntry(memoryRow());
    expect(entry).toMatchObject({ id: "mem-1", type: "business_rule", scope: "quote", status: "approved" });
  });

  it("TEST 12 — rule_candidate는 status=candidate로 구분한다", () => {
    const entry = toHermesMemoryEntry(memoryRow({ memory_type: "rule_candidate", key: "merge_pattern", value: { note: "3번 병합 요청" } }));
    expect(entry.status).toBe("candidate");
  });

  it("approved와 candidate를 서로 다른 블록으로 분리하고 강제 여부를 명시한다(§3)", () => {
    const block = formatHermesMemoryBlock([
      toHermesMemoryEntry(memoryRow({ id: "a1", key: "room_change_rule", value: { note: "구도만 다르면 분리 안 함" } })),
      toHermesMemoryEntry(memoryRow({ id: "c1", memory_type: "rule_candidate", id2: undefined, key: "merge_pattern", value: { note: "3번 병합 요청" } } as Partial<OliviaMemoryRow>)),
    ]);
    expect(block).toContain("<approved_rules>");
    expect(block).toContain("<rule_candidates>");
    expect(block).toContain("room_change_rule");
    expect(block).toContain("merge_pattern");
    expect(block.indexOf("approved_rules")).toBeLessThan(block.indexOf("rule_candidates"));
  });

  it("memory가 없으면 빈 문자열을 반환한다", () => {
    expect(formatHermesMemoryBlock([])).toBe("");
  });

  // TEST 11/12 — 관련 있는 memory는 System Prompt에 포함되고, 없으면 아예 블록 자체가 생기지 않는다.
  it("관련 memory가 있으면 Hermes System Prompt에 포함된다(TEST 11)", () => {
    const prompt = buildHermesSystemPrompt("req-1", {
      recentActions: [], revision: 0,
      memories: [toHermesMemoryEntry(memoryRow({ key: "room_change_rule", value: { note: "구도만 다르면 분리 안 함" } }))],
    });
    expect(prompt).toContain("room_change_rule");
    expect(prompt).toContain("<approved_rules>");
  });

  it("관련 memory가 없으면 System Prompt에 memory 블록을 넣지 않는다(TEST 12)", () => {
    const prompt = buildHermesSystemPrompt("req-1", { recentActions: [], revision: 0 });
    expect(prompt).not.toContain("<approved_rules>");
    expect(prompt).not.toContain("<rule_candidates>");
  });

  it("compactConversationSummary가 있으면 System Prompt에 포함된다(§4C, TEST 15)", () => {
    const prompt = buildHermesSystemPrompt("req-1", {
      recentActions: [], revision: 0,
      compactConversationSummary: "대표가 지난주 강재활의학과 견적을 3건 만들었다.",
    });
    expect(prompt).toContain("강재활의학과 견적을 3건 만들었다");
  });
});
