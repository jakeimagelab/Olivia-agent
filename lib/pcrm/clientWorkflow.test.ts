import { describe, expect, it } from "vitest";
import {
  getClientNextAction,
  getClientVisibleMenus,
  getClientWorkflowProgress,
  getClientWorkflowStage,
} from "./clientWorkflow";

describe("PCRM 고객용 워크플로우 매핑", () => {
  it("내부 백업·셀렉 단계를 고객용 갤러리 단계로 묶는다", () => {
    expect(getClientWorkflowStage("backup_sorting")).toBe("gallery");
    expect(getClientWorkflowStage("raw_matching")).toBe("gallery");
  });

  it("완료 프로젝트의 진행률은 100%다", () => {
    expect(getClientWorkflowProgress("quote", "completed")).toBe(100);
  });

  it("현재 단계에 맞는 고객 행동을 제시한다", () => {
    expect(getClientNextAction("conti")).toEqual({
      title: "촬영 콘티를 확인해 주세요.",
      href: "/client-portal/conti",
    });
  });

  it("아직 도달하지 않은 메뉴를 숨긴다", () => {
    const menus = getClientVisibleMenus("quote");
    expect(menus.documents).toBe(true);
    expect(menus.gallery).toBe(false);
    expect(menus.progress).toBe(true);
  });
});
