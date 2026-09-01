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
});
