import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildExecutedToolsContext,
  executedToolsFromMetadata,
  withExecutedToolsMetadata,
} from "@/lib/olivia/v2/executionEvidence";

describe("Olivia 실행 증거", () => {
  it("직전 turn의 실제 도구가 0개면 실행 없음 컨텍스트를 만든다", () => {
    const context = buildExecutedToolsContext([
      { role: "assistant", metadata: { executedTools: [] } },
    ]);
    expect(context).toContain("<executed_tools>");
    expect(context).toContain("없음 (0개)");
  });

  it("기존 toolCalls도 정규화해 canonical executedTools로 저장한다", () => {
    const metadata = withExecutedToolsMetadata({
      toolCalls: [
        { name: "mcp_olivia_client.search", success: true },
        { toolName: "client_create", success: false },
      ],
    });
    expect(metadata.executedTools).toEqual([
      { name: "client_search", success: true },
      { name: "client_create", success: false },
    ]);
    expect(executedToolsFromMetadata(metadata)).toEqual(metadata.executedTools);
  });
});

describe("Olivia 양쪽 실행 경로의 도구 미호출 방어", () => {
  it("Hermes와 legacy가 같은 isToolExecutionMiss 판정을 사용한다", () => {
    const hermesSource = readFileSync("lib/olivia/v2/stream/hermesTurn.ts", "utf8");
    const legacySource = readFileSync("lib/olivia/v2/stream/legacyTurn.ts", "utf8");
    expect(hermesSource).toContain("isToolExecutionMiss({");
    expect(legacySource).toContain("isToolExecutionMiss({");
    expect(legacySource).toContain("도구를 호출하지 못해서 아무 작업도 하지 않았습니다");
  });

  it("도구 0회 폴백 배지는 완료라고 표현하지 않는다", () => {
    const source = readFileSync("components/olivia-v2/OliviaConversation.tsx", "utf8");
    const zeroToolText = "대체 경로로 답했지만 실행된 작업은 없습니다 · 실행된 도구: 0개";
    expect(source).toContain(zeroToolText);
    expect(zeroToolText).not.toContain("완료");
  });

  it("시스템 상태 팝업은 MCP와 migration 경고를 표시한다", () => {
    const source = readFileSync("components/olivia-os/StatusPanelButton.tsx", "utf8");
    expect(source).toContain("MCP 도구 · {data.mcp.state} · 도구");
    expect(source).toContain("시스템 진단 DB가 준비되지 않았습니다.");
  });
});
