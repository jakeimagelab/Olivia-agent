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
});
