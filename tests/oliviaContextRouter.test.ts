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
