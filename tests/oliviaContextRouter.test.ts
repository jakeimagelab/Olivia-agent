import { beforeEach, describe, expect, it } from "vitest";
import { buildOliviaPageContext, useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { classifyOliviaRequest } from "@/lib/olivia/v2/modelRouter";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

describe("Olivia Context와 Model Router", () => {
  beforeEach(() => useOliviaContextStore.getState().clearContext());

  it("동적 Page Context에 고객·프로젝트·Workspace·선택 항목을 구조화한다", () => {
    const store = useOliviaContextStore.getState();
    store.setClient("client-1", "히어산부인과");
    store.setProject("project-1", "브랜드 촬영");
    store.setWorkspace("quote", "quote-1");
    store.setSelection("quote-item", "profile_shoot");

    const pageContext = JSON.parse(buildOliviaPageContext("/admin/dashboard/home"));
    expect(pageContext).toMatchObject({
      page: "/admin/dashboard/home",
      client: { id: "client-1", name: "히어산부인과" },
      project: { id: "project-1", name: "브랜드 촬영" },
      workspace: { type: "quote", resourceId: "quote-1" },
      selection: { type: "quote-item", id: "profile_shoot" },
    });
  });

  it("E. Workspace와 문서가 바뀌면 row/scene transient context를 정리한다", () => {
    const store = useOliviaContextStore.getState();
    store.setWorkspace("conti", "conti-1");
    store.setPageContext({ capabilities: ["conti.edit"], selectedSceneId: "scene3", selectedRowId: "row3" });
    store.setCurrentDocument("conti-1", "storyboard", "첫 콘티");
    store.setWorkspace("quote", "quote-1");

    expect(useOliviaContextStore.getState()).toMatchObject({
      activeWorkspace: "quote",
      activeResourceId: "quote-1",
      selectedSceneId: undefined,
      selectedRowId: undefined,
      capabilities: undefined,
      currentDocumentId: undefined,
    });

    store.setPageContext({ selectedRowId: "quote-row-1" });
    store.setCurrentDocument("quote-1", "quote", "첫 견적");
    store.setCurrentDocument("quote-2", "quote", "둘째 견적");
    expect(useOliviaContextStore.getState().selectedRowId).toBeUndefined();
  });

  it("F. 실제 brand와 확장 PageContext를 snapshot에 그대로 유지한다", () => {
    const store = useOliviaContextStore.getState();
    store.setWorkspace("quote", "quote-1");
    store.setPageContext({
      pageMode: "edit",
      capabilities: ["quote.edit", "quote.publish"],
      documentStatus: "draft",
      brand: "jakeimage",
      canEdit: true,
      canFinalize: true,
    });

    const pageContext = JSON.parse(buildOliviaPageContext("/quote"));
    expect(pageContext).toMatchObject({
      pageMode: "edit",
      capabilities: ["quote.edit", "quote.publish"],
      documentStatus: "draft",
      brand: "jakeimage",
      canEdit: true,
      canFinalize: true,
    });
  });

  it("열린 Resource/Selection이 있으면 짧은 금액 명령을 TOOL_ACTION으로 분류한다", () => {
    const context: OliviaContextSnapshot = {
      activeWorkspace: "quote",
      activeResourceId: "quote-1",
      selectedEntityType: "quote-item",
      selectedEntityId: "profile_shoot",
      recentActions: [],
      revision: 1,
    };
    expect(classifyOliviaRequest("50으로", context)).toBe("TOOL_ACTION");
    expect(classifyOliviaRequest("브랜드 전략 전체 분석해줘", context)).toBe("REASONING");
  });

  it("Telegram의 짧은 승인·실행 표현을 TOOL_ACTION으로 분류한다", () => {
    const context: OliviaContextSnapshot = { recentActions: [], revision: 0 };
    expect(classifyOliviaRequest("해 줘", context)).toBe("TOOL_ACTION");
    expect(classifyOliviaRequest("맞아 230만원으로 맞추면 돼", context)).toBe("TOOL_ACTION");
  });

  // PHASE 4 작업 3(2026-09-25) — 정규식(말투)보다 Context(상황)를 먼저 본다.
  it("문서가 열려 있으면 정규식으로 못 잡는 짧은 발화도 TOOL_ACTION으로 본다", () => {
    const quoteOpen: OliviaContextSnapshot = { currentDocumentId: "quote-1", currentDocumentType: "quote", recentActions: [], revision: 1 };
    expect(classifyOliviaRequest("1500으로", quoteOpen)).toBe("TOOL_ACTION");

    const contractOpen: OliviaContextSnapshot = { currentDocumentId: "contract-1", currentDocumentType: "contract", recentActions: [], revision: 1 };
    expect(classifyOliviaRequest("이대로 해줘", contractOpen)).toBe("TOOL_ACTION");
  });

  it("아무 Context도 없으면 짧은 발화도 NORMAL_CHAT이다", () => {
    const context: OliviaContextSnapshot = { recentActions: [], revision: 0 };
    expect(classifyOliviaRequest("고마워", context)).toBe("NORMAL_CHAT");
  });

  it("고객이 확정돼 있으면 자원+실행 동사 조합을 TOOL_ACTION으로 본다(문서가 안 열려 있어도)", () => {
    const clientSelected: OliviaContextSnapshot = { activeClientId: "client-1", recentActions: [], revision: 0 };
    expect(classifyOliviaRequest("견적 승인해", clientSelected)).toBe("TOOL_ACTION");
  });

  it("고객이 없어도 실행 동사 자체가 있으면 TOOL_ACTION으로 넘겨 도구가 대상을 되묻게 한다", () => {
    const noClient: OliviaContextSnapshot = { recentActions: [], revision: 0 };
    expect(classifyOliviaRequest("견적 승인해", noClient)).toBe("TOOL_ACTION");
  });

  it("문서가 열려 있어도 20자 이하 REASONING 요청은 TOOL_ACTION으로 새지 않는다(회귀 방지)", () => {
    // "전체 분석해줘"는 7자라 hasShortOpenTargetUtterance 조건(길이<=20 + currentDocumentId)에도
    // 그대로 걸린다 — REASONING_PATTERN을 Context 규칙보다 먼저 봐야만 이 테스트가 통과한다.
    const context: OliviaContextSnapshot = { currentDocumentId: "quote-1", recentActions: [], revision: 1 };
    expect(classifyOliviaRequest("전체 분석해줘", context)).toBe("REASONING");
  });

  it("같은 고객·프로젝트·workspace를 다시 동기화해도 revision을 증가시키지 않는다", () => {
    const store = useOliviaContextStore.getState();
    store.setClient("client-1", "히어산부인과");
    store.setProject("project-1", "브랜드 촬영");
    store.setWorkspace("quote", "quote-1");
    const before = useOliviaContextStore.getState();

    store.setClient("client-1", "히어산부인과");
    store.setProject("project-1", "브랜드 촬영");
    store.setWorkspace("quote", "quote-1");

    expect(useOliviaContextStore.getState()).toBe(before);
  });
});
