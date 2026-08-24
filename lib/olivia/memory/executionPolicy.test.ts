import { describe, expect, it } from "vitest";
import { resolveExecutionPolicy } from "./executionPolicy";
import type { OliviaMemoryRow } from "./types";

function memory(overrides: Partial<OliviaMemoryRow>): OliviaMemoryRow {
  return {
    id: overrides.id || "mem-1",
    memory_type: "business_rule",
    key: "test_key",
    value: {},
    scope: "quote",
    priority: 50,
    confidence: 1,
    source: "user_teaching",
    source_message_id: null,
    usage_count: 0,
    success_count: 0,
    failure_count: 0,
    is_active: true,
    created_at: "2026-08-24T00:00:00Z",
    updated_at: "2026-08-24T00:00:00Z",
    ...overrides,
  };
}

describe("resolveExecutionPolicy", () => {
  it("빈 memory 배열이면 정책이 전부 비어 있다(마이그레이션 미적용/규칙 미학습 상태와 동일)", () => {
    const policy = resolveExecutionPolicy([]);
    expect(policy).toEqual({});
  });

  it("ifClientMissing/ifProjectMissing 값을 autoCreateClient/autoCreateProject로 매핑한다", () => {
    const policy = resolveExecutionPolicy([
      memory({ value: { ifClientMissing: "create_client_from_request", ifProjectMissing: "create_project_from_request" } }),
    ]);
    expect(policy.autoCreateClient).toBe(true);
    expect(policy.autoCreateProject).toBe(true);
  });

  it("사용자가 '프로젝트는 자동 생성하지 마'라고 수정한 규칙(최신 값)이 우선 적용된다", () => {
    // update_agent_memory는 같은 key+scope 행을 덮어쓰므로 실제로는 항상 배열에 최신 값 하나만
    // 들어온다 — priority desc, updated_at desc로 정렬된 리스트를 그대로 순회했을 때도 먼저 나온
    // 값(더 최신/우선순위 높음)이 이겨야 한다.
    const policy = resolveExecutionPolicy([
      memory({ priority: 100, updated_at: "2026-08-24T01:00:00Z", value: { ifClientMissing: "create_client_from_request", ifProjectMissing: "do_not_create" } }),
    ]);
    expect(policy.autoCreateClient).toBe(true);
    expect(policy.autoCreateProject).toBe(false);
  });

  it("비활성(is_active:false) memory는 무시한다", () => {
    const policy = resolveExecutionPolicy([
      memory({ is_active: false, value: { ifClientMissing: "create_client_from_request" } }),
    ]);
    expect(policy.autoCreateClient).toBeUndefined();
  });

  it("alias 타입 memory를 aliases map으로 모은다", () => {
    const policy = resolveExecutionPolicy([
      memory({
        memory_type: "alias",
        key: "select_matching_alias_group",
        scope: "select_match",
        value: { terms: ["셀렉매칭", "RAW매칭"], canonical: "select_match" },
      }),
    ]);
    expect(policy.aliases).toEqual({
      셀렉매칭: "select_match",
      RAW매칭: "select_match",
      select_matching_alias_group: "select_match",
    });
  });

  it("document_rule 타입 memory를 documentRules map으로 모은다", () => {
    const policy = resolveExecutionPolicy([
      memory({ memory_type: "document_rule", key: "storyboard_person_list_split", scope: "storyboard", value: { splitEachPerson: true } }),
    ]);
    expect(policy.documentRules).toEqual({ storyboard_person_list_split: { splitEachPerson: true } });
  });

  it("같은 필드를 먼저 채운 규칙(우선순위 높음)이 뒤에 오는 규칙에 덮어써지지 않는다", () => {
    const policy = resolveExecutionPolicy([
      memory({ priority: 100, value: { ifClientMissing: "create_client_from_request" } }),
      memory({ id: "mem-2", key: "older_rule", priority: 50, value: { ifClientMissing: "do_not_create" } }),
    ]);
    expect(policy.autoCreateClient).toBe(true);
  });
});
