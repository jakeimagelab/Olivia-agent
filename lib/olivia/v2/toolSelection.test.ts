import { describe, expect, it } from "vitest";
import { buildCanonicalRecentUserText, getOliviaToolDomains, resolveRequiredFollowupTool, resolveToollessActionRetry, restoreDocumentContextFromHistory, selectOliviaTools } from "./toolSelection";
import type { OliviaContextSnapshot } from "./types";
import { getSelectedContiSceneId } from "./toolExecutors/conti";

const baseContext: OliviaContextSnapshot = {
  recentActions: [],
  revision: 0,
};

describe("selectOliviaTools", () => {
  it("포함한다: 견적 키워드가 있으면 create_quote", () => {
    const tools = selectOliviaTools({ requestClass: "TOOL_ACTION", message: "견적서 하나 만들어줘요. 유진스의원 정유진원장님 프리미엄패키지로 진행", context: baseContext });
    expect(tools.some((t) => t.name === "create_quote")).toBe(true);
  });

  // 2026-08-24 실제 사고 재현: "견적서 만들어줘"(quote 도메인) 다음에 키워드 없는 "해줘"만
  // 보내면, 그 턴만 보고 도구를 고르던 예전 로직은 create_quote를 목록에서 빼버려서 모델이
  // "이 대화에는 실행 기능이 연결되어 있지 않다"고 지어내는 사고로 이어졌다.
  it("직전 메시지에 견적 키워드가 있으면, 키워드 없는 후속 확인('해줘')에도 create_quote를 유지한다", () => {
    const recentText = "견적서 하나 만들어줘요. 유진스의원 정유진원장님 프리미엄패키지로 진행 서비스로는 2가지 시술 릴스영상 촬영(30초)";
    const tools = selectOliviaTools({ requestClass: "TOOL_ACTION", message: "해줘", context: baseContext, recentText });
    expect(tools.some((t) => t.name === "create_quote")).toBe(true);
  });

  it("recentText 없이 키워드 없는 메시지만 있으면 SAFE_FALLBACK으로 좁혀지고 create_quote는 없다", () => {
    const tools = selectOliviaTools({ requestClass: "NORMAL_CHAT", message: "해줘", context: baseContext });
    expect(tools.some((t) => t.name === "create_quote")).toBe(false);
    expect(tools.some((t) => t.name === "open_feature")).toBe(true);
  });

  it("여러 도메인이 겹쳐도(견적+고객) 필요한 도구가 잘리지 않는다", () => {
    // "유진스의원"은 quote(견적)와 client(의원) 두 도메인을 동시에 매칭시킨다 — 예전 15개
    // 상한에서는 이 조합만으로도 상한에 딱 닿아 다른 도메인이 하나만 더 겹쳐도 잘렸다.
    const tools = selectOliviaTools({ requestClass: "TOOL_ACTION", message: "견적서 하나 만들어줘요. 유진스의원 콘티도 같이 확인해줘", context: baseContext });
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_quote");
    expect(names).toContain("get_conti_status");
    expect(names).toContain("search_client_projects");
  });

  it("getOliviaToolDomains는 recentText와 message를 합쳐서 판단한다", () => {
    const domains = getOliviaToolDomains("해줘", baseContext, "콘티 10~15번 컷 추가해줘");
    expect(domains).toContain("conti");
  });

  it("canonical history의 최근 사용자 발화만 도구 선택 문맥으로 만든다", () => {
    expect(buildCanonicalRecentUserText([
      { role: "user", content: "Test 병원 견적서 만들어줘" },
      { role: "assistant", content: "견적서를 만들었어요" },
      { role: "user", content: "어떻게 확인해?" },
    ])).toBe("Test 병원 견적서 만들어줘\n어떻게 확인해?");
  });

  it("견적 문맥 뒤 '다시 만들어줘'는 도구 없는 첫 응답을 create_quote 재시도로 복구한다", () => {
    expect(resolveRequiredFollowupTool({
      message: "다시 만들어줄래?",
      recentText: "Test 병원 견적서 만들어줘\n어떻게 확인하면 돼?",
      availableToolNames: ["create_quote", "list_temporary_documents"],
    })).toBe("create_quote");
  });

  it("견적 생성 실패 원인 질문은 canonical 문서 DB 조회를 강제한다", () => {
    expect(resolveRequiredFollowupTool({
      message: "왜 생성이 안 돼?",
      recentText: "Test 병원 견적서 만들어줘",
      availableToolNames: ["create_quote", "search_documents", "list_temporary_documents"],
    })).toBe("search_documents");
  });

  it("TOOL_ACTION 첫 라운드가 텍스트만 반환하면 확정 도구로 한 번 재시도한다", () => {
    expect(resolveToollessActionRetry(0, "create_quote", 0)).toEqual({ type: "function", name: "create_quote" });
    expect(resolveToollessActionRetry(1, "create_quote", 0)).toBeUndefined();
    expect(resolveToollessActionRetry(0, "create_quote", 1)).toBeUndefined();
  });

  it("총액 조정 승인과 짧은 실행 요청을 apply_quote_rebalance로 복원한다", () => {
    const availableToolNames = ["rebalance_quote_total", "apply_quote_rebalance"];
    expect(resolveRequiredFollowupTool({
      message: "맞아 230만원으로 맞추면 돼",
      recentText: "리나 클리닉 견적서 총액 230만원으로 조정",
      availableToolNames,
    })).toBe("apply_quote_rebalance");
    expect(resolveRequiredFollowupTool({
      message: "해 줘",
      recentText: "리나 클리닉 견적서 230만원으로 맞추면 돼",
      availableToolNames,
    })).toBe("apply_quote_rebalance");
  });

  it("Telegram의 빈 화면 context를 최근 assistant 문서 metadata로 복원한다", () => {
    expect(restoreDocumentContextFromHistory(baseContext, [
      { metadata: { resourceType: "quote", resourceId: "quote-lina", clientId: "client-lina" } },
    ])).toMatchObject({
      activeWorkspace: "quote",
      activeResourceId: "quote-lina",
      currentDocumentType: "quote",
      currentDocumentId: "quote-lina",
      activeClientId: "client-lina",
    });
  });

  it("A. 견적 최종 승인이 가능하면 publish 도구를 후보에 포함한다", () => {
    const tools = selectOliviaTools({
      requestClass: "TOOL_ACTION",
      message: "최종 승인해",
      context: { ...baseContext, activeWorkspace: "quote", canFinalize: true, capabilities: ["quote.publish"] },
    });
    expect(tools.map((tool) => tool.name)).toContain("request_quote_publish");
  });

  it("B. 견적 최종 승인이 불가능하면 publish 도구를 후보에서 제외한다", () => {
    const tools = selectOliviaTools({
      requestClass: "TOOL_ACTION",
      message: "최종 승인해",
      context: { ...baseContext, activeWorkspace: "quote", canFinalize: false, capabilities: ["quote.publish"] },
    });
    expect(tools.map((tool) => tool.name)).not.toContain("request_quote_publish");
  });

  it("C. 콘티의 명시적 selectedSceneId를 legacy selection보다 우선한다", () => {
    expect(getSelectedContiSceneId({
      ...baseContext,
      activeWorkspace: "conti",
      selectedSceneId: "scene3",
      selectedEntityType: "conti-shot",
      selectedEntityId: "legacy-scene",
    })).toBe("scene3");
    const tools = selectOliviaTools({
      requestClass: "TOOL_ACTION",
      message: "이 장면 삭제해",
      context: { ...baseContext, activeWorkspace: "conti", selectedSceneId: "scene3", capabilities: ["conti.remove_scene"] },
    });
    expect(tools.map((tool) => tool.name)).toContain("remove_conti_shot");
  });

  it("D. 계약 편집이 가능하면 계약 조건 수정 도구를 후보에 포함한다", () => {
    const tools = selectOliviaTools({
      requestClass: "TOOL_ACTION",
      message: "계약금 30%로",
      context: { ...baseContext, activeWorkspace: "contract", canEdit: true, capabilities: ["contract.edit"] },
    });
    expect(tools.map((tool) => tool.name)).toContain("update_contract_terms");
  });
});
