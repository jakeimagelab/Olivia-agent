import { describe, expect, it } from "vitest";
import {
  compactWorkItemReferences,
  formatWorkItemReferenceContext,
  resolveWorkItemReference,
  sortChatWorkItems,
  type OliviaChatWorkItem,
} from "../../lib/olivia/chatTypes";

const item = (overrides: Partial<OliviaChatWorkItem>): OliviaChatWorkItem => ({
  id: "item",
  kind: "insight",
  title: "확인 필요",
  summary: "요약",
  availableActions: ["view"],
  ...overrides,
});

describe("Olivia chat work item context", () => {
  it("우선순위가 높은 항목을 먼저 정렬하고 동점이면 기한이 빠른 항목을 먼저 둔다", () => {
    const sorted = sortChatWorkItems([
      item({ id: "low", priorityScore: 30, dueAt: "2026-07-18T01:00:00Z" }),
      item({ id: "later", priorityScore: 80, dueAt: "2026-07-20T01:00:00Z" }),
      item({ id: "soon", priorityScore: 80, dueAt: "2026-07-19T01:00:00Z" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["soon", "later", "low"]);
  });

  it("직전 결과의 1부터 시작하는 순번과 ID를 안정적으로 해석한다", () => {
    const refs = compactWorkItemReferences([
      item({ id: "first", workflowRunId: "run-1" }),
      item({ id: "second", workflowRunId: "run-2" }),
    ]);
    expect(resolveWorkItemReference(refs, null, 1)?.id).toBe("first");
    expect(resolveWorkItemReference(refs, null, 2)?.workflowRunId).toBe("run-2");
    expect(resolveWorkItemReference(refs, "second")?.id).toBe("second");
    expect(resolveWorkItemReference(refs, null, 3)).toBeNull();
  });

  it("모델 문맥에 순번과 서버 참조 ID를 포함한다", () => {
    const refs = compactWorkItemReferences([
      item({ id: "insight-1", title: "콘티 미승인", clientName: "오블리브의원", workflowRunId: "run-1", status: "open" }),
    ]);
    const context = formatWorkItemReferenceContext(refs);
    expect(context).toContain("1. [insight] 콘티 미승인");
    expect(context).toContain("id=insight-1");
    expect(context).toContain("workflowRunId=run-1");
  });

  it("대화 문맥에 저장하는 참조 수를 12개로 제한한다", () => {
    const refs = compactWorkItemReferences(Array.from({ length: 20 }, (_, index) => item({ id: String(index) })));
    expect(refs).toHaveLength(12);
  });
});
