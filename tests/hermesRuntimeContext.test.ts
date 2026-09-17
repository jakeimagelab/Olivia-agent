import { describe, expect, it } from "vitest";
import { buildHermesRuntime, resourceSessionMetadata } from "@/lib/hermes/runtimeContext";

const baseSnapshot = { recentActions: [], revision: 1 };

describe("Hermes Olivia runtime context", () => {
  it("현재 화면의 canonical resource를 work session으로 사용한다", () => {
    const runtime = buildHermesRuntime({
      snapshot: { ...baseSnapshot, activeClientId: "client-1", activeClientName: "강재활", activeWorkspace: "quote", activeResourceId: "quote-1", currentDocumentType: "quote", currentDocumentId: "quote-1", currentDocumentTitle: "강재활 견적" },
      channel: "web", today: "2026-09-10", message: "프로필 3명으로 바꿔", history: [],
    });
    expect(runtime.context.activeResource).toMatchObject({ type: "quote", id: "quote-1", title: "강재활 견적" });
    expect(runtime.context.workSession).toMatchObject({ id: "resource:quote:quote-1", clientId: "client-1" });
  });

  it("Telegram Reply resource가 현재 화면보다 우선한다", () => {
    const runtime = buildHermesRuntime({
      snapshot: { ...baseSnapshot, activeWorkspace: "quote", activeResourceId: "quote-new" },
      channel: "telegram", today: "2026-09-10", message: "이거 다시 수정", history: [],
      replyContext: { resourceType: "quote", resourceId: "quote-old", workSessionId: "resource:quote:quote-old", clientId: "client-old" },
    });
    expect(runtime.context.activeResource?.id).toBe("quote-old");
    expect(runtime.context.activeClientId).toBe("client-old");
  });

  it("명시적 과거 참조는 최근 resource session을 복원한다", () => {
    const runtime = buildHermesRuntime({
      snapshot: baseSnapshot,
      channel: "telegram", today: "2026-09-10", message: "아까 강재활 견적 10% 할인해줘",
      history: [{ role: "assistant", content: "견적서를 만들었어요.", metadata: { resourceType: "quote", resourceId: "quote-1", clientId: "client-1", workSessionId: "resource:quote:quote-1" } }],
    });
    expect(runtime.context.activeResource).toMatchObject({ type: "quote", id: "quote-1" });
  });

  it("별개 작업을 최근 견적 resource에 억지로 연결하지 않는다", () => {
    const runtime = buildHermesRuntime({
      snapshot: { ...baseSnapshot, activeWorkspace: "quote", activeResourceId: "quote-current", currentDocumentType: "quote", currentDocumentId: "quote-current" },
      channel: "web", today: "2026-09-10", message: "다운로드 사진 4500으로 바꿔",
      history: [{ role: "assistant", content: "견적서를 만들었어요.", metadata: { resourceType: "quote", resourceId: "quote-1" } }],
    });
    expect(runtime.context.activeResource).toBeUndefined();
    expect(runtime.context.workSession).toBeUndefined();
  });

  it("resource message metadata에 재사용 가능한 workSessionId를 기록한다", () => {
    expect(resourceSessionMetadata({ resourceType: "contract", resourceId: "contract-1", resourceVersion: 3 }))
      .toMatchObject({ resourceType: "contract", resourceId: "contract-1", resourceVersion: 3, workSessionId: "resource:contract:contract-1" });
  });

  // TEST 4 (§17 "Active UI와 대화 대상 불일치 처리") — 채팅에서 찾은 견적 A와 실제 열려 있는
  // 화면(견적 B)이 다를 때 "그럼 바꿔줘"는 화면에 열린 B가 아니라 방금 찾은 A를 가리킨다.
  it("후속 실행 명령은 지금 열린 화면보다 방금 전 turn에서 확정한 resource를 우선한다(TEST 4)", () => {
    const runtime = buildHermesRuntime({
      snapshot: { ...baseSnapshot, activeWorkspace: "quote", activeResourceId: "quote-B", currentDocumentType: "quote", currentDocumentId: "quote-B" },
      channel: "web", today: "2026-09-14", message: "그럼 바꿔줘",
      history: [{ role: "assistant", content: "최근 견적서를 찾았어요.", metadata: { resourceType: "quote", resourceId: "quote-A", workSessionId: "resource:quote:quote-A" } }],
    });
    expect(runtime.context.activeResource).toMatchObject({ type: "quote", id: "quote-A" });
    expect(runtime.context.workSession?.id).toBe("resource:quote:quote-A");
  });

  it("대상이 없는 단독 '열어' 명령도 방금 찾은 resource를 사용한다", () => {
    const runtime = buildHermesRuntime({
      snapshot: { ...baseSnapshot, activeWorkspace: "quote", activeResourceId: "quote-B" },
      channel: "web", today: "2026-09-14", message: "열어",
      history: [{ role: "assistant", content: "최근 견적서를 찾았어요.", metadata: { resourceType: "quote", resourceId: "quote-A", workSessionId: "resource:quote:quote-A" } }],
    });
    expect(runtime.context.activeResource?.id).toBe("quote-A");
  });

  it("외부 파일 작업 표현이면 UI 실행 표현이 있어도 최근 resource를 억지로 연결하지 않는다", () => {
    const runtime = buildHermesRuntime({
      snapshot: { ...baseSnapshot, activeWorkspace: "quote", activeResourceId: "quote-current", currentDocumentType: "quote", currentDocumentId: "quote-current" },
      channel: "web", today: "2026-09-14", message: "다운로드 사진 4500으로 바꿔",
      history: [{ role: "assistant", content: "견적서를 만들었어요.", metadata: { resourceType: "quote", resourceId: "quote-1" } }],
    });
    expect(runtime.context.activeResource).toBeUndefined();
  });

  // TEST 11/12 (§2/§3) — scope로 걸러 넘긴 memories와 §4C compactConversationSummary는
  // context에 그대로 실려서 buildHermesSystemPrompt까지 전달돼야 한다.
  it("memories/compactConversationSummary를 context에 그대로 실어 나른다", () => {
    const runtime = buildHermesRuntime({
      snapshot: baseSnapshot,
      channel: "web", today: "2026-09-14", message: "견적 만들어줘", history: [],
      memories: [{ id: "m1", type: "business_rule", scope: "quote", content: "k: {}", status: "approved", source: "user_teaching" }],
      compactConversationSummary: "지난주 견적 3건을 만들었다.",
    });
    expect(runtime.context.memories).toHaveLength(1);
    expect(runtime.context.compactConversationSummary).toBe("지난주 견적 3건을 만들었다.");
  });
});
