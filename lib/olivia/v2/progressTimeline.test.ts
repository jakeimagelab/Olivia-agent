import { describe, expect, it } from "vitest";
import {
  appendProgressStep,
  attachProgressToolCall,
  finalizeProgressSteps,
  resolveProgressToolCall,
} from "./progressTimeline";

describe("Olivia progress timeline", () => {
  it("새 상태는 일반 active 단계만 완료하고 결과를 기다리는 도구 단계는 유지한다", () => {
    const next = appendProgressStep([
      { id: "plain", label: "확인 중", state: "active" },
      { id: "tool", label: "저장 중", state: "active", toolCallId: "call-1" },
    ], { id: "next", label: "정리 중", state: "active" });
    expect(next).toEqual([
      { id: "plain", label: "확인 중", state: "done" },
      { id: "tool", label: "저장 중", state: "active", toolCallId: "call-1" },
      { id: "next", label: "정리 중", state: "active" },
    ]);
  });

  it("tool_start는 직전 상태에 연결되고 대응 상태가 없으면 fallback 단계를 만든다", () => {
    expect(attachProgressToolCall(
      [{ id: "step", label: "견적 저장 중", state: "active" }],
      { toolCallId: "call-1", fallbackId: "fallback", fallbackLabel: "도구 실행 중" },
    )).toEqual([{ id: "step", label: "견적 저장 중", state: "active", toolCallId: "call-1" }]);

    expect(attachProgressToolCall([], {
      toolCallId: "call-2",
      fallbackId: "fallback",
      fallbackLabel: "도구 실행 중",
    })).toEqual([{ id: "fallback", label: "도구 실행 중", state: "active", toolCallId: "call-2" }]);
  });

  it("tool_result만 도구 단계의 성공과 실패를 확정한다", () => {
    const active = [{ id: "tool", label: "저장 중", state: "active" as const, toolCallId: "call-1" }];
    expect(resolveProgressToolCall(active, "call-1", true)[0].state).toBe("done");
    expect(resolveProgressToolCall(active, "call-1", false)[0].state).toBe("error");
  });

  it("정상 종료에서도 결과가 누락된 도구 단계는 성공으로 바꾸지 않는다", () => {
    const result = finalizeProgressSteps([
      { id: "plain", label: "정리 중", state: "active" },
      { id: "tool", label: "저장 중", state: "active", toolCallId: "call-1" },
    ], "complete");
    expect(result.map((step) => step.state)).toEqual(["done", "error"]);
  });

  it("스트림 오류와 타임아웃은 남은 active 단계를 error로 닫는다", () => {
    const result = finalizeProgressSteps([
      { id: "active", label: "응답 생성 중", state: "active" },
      { id: "done", label: "조회 완료", state: "done" },
    ], "error");
    expect(result.map((step) => step.state)).toEqual(["error", "done"]);
  });
});
