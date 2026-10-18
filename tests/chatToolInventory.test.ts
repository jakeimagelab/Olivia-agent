import { describe, expect, it } from "vitest";
import { CHAT_MODEL_TOOL_NAMES } from "@/lib/olivia/chatToolInventory";
import { resolveRemovedChatFeatureNotice } from "@/lib/olivia/removedChatFeature";
import { listHermesOliviaTools } from "@/lib/hermes/mcp/oliviaToolBridge";
import { OLIVIA_V2_TOOLS } from "@/lib/olivia/v2/toolExecutor";

describe("chat tool inventory", () => {
  const expected = [...CHAT_MODEL_TOOL_NAMES].sort();

  it("v2 모델 노출 도구가 대표 지정 89개와 정확히 같다", () => {
    expect(OLIVIA_V2_TOOLS.map((tool) => tool.name).sort()).toEqual(expected);
  });

  it("Hermes MCP 등록 도구가 같은 89개와 정확히 같다", () => {
    const actual = listHermesOliviaTools().map((tool) => tool.name).sort();
    expect(actual).toEqual(expected);
  });

  it("삭제 기능 실행은 안내하고 화면 열기는 계속 허용한다", () => {
    expect(resolveRemovedChatFeatureNotice("메모 남겨줘 내일 촬영 준비"))
      .toBe("이 기능은 채팅에서 쓰지 않아요. 화면에서 '메모'을 열어 사용해 주세요.");
    expect(resolveRemovedChatFeatureNotice("메모 열어줘")).toBeNull();
  });
});
