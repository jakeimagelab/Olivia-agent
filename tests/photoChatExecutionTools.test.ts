import { describe, expect, it } from "vitest";
import { selectOliviaTools } from "@/lib/olivia/v2/toolSelection";

const context = { recentActions: [], revision: 0 };

describe("사진작업실 채팅 실행 tool selection", () => {
  it("JPG 분리 요청에 폴더 검색과 source prep 도구를 제공한다", () => {
    const names = selectOliviaTools({
      requestClass: "TOOL_ACTION",
      message: "르셀청담 JPG 분리해줘",
      context,
    }).map((tool) => tool.name);
    expect(names).toContain("find_photo_folder");
    expect(names).toContain("start_photo_source_prep");
  });

  it("씬별 분류 요청에 폴더 검색·전체 파이프라인·상태 조회 도구를 제공한다", () => {
    const names = selectOliviaTools({
      requestClass: "TOOL_ACTION",
      message: "르셀청담 사진 씬별 분류해줘",
      context,
    }).map((tool) => tool.name);
    expect(names).toContain("find_photo_folder");
    expect(names).toContain("start_photo_scene_sort");
    expect(names).toContain("get_photo_storage_status");
  });

  it.each([
    ["르셀청담 셀렉한 거 RAW 매칭해줘", "start_photo_raw_match"],
    ["르셀청담 씬별분류 리사이즈해줘", "start_photo_resize"],
    ["르셀청담 사진 AI 셀렉해줘", "start_photo_ai_select"],
    ["르셀청담 사진 피부 보정 분석해줘", "start_photo_retouch"],
  ])("후속 사진 요청 '%s'에 %s 도구를 제공한다", (message, toolName) => {
    const names = selectOliviaTools({ requestClass: "TOOL_ACTION", message, context }).map((tool) => tool.name);
    expect(names).toContain("find_photo_folder");
    expect(names).toContain(toolName);
    expect(names).toContain("get_photo_storage_status");
  });
});
