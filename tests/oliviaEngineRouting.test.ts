import { describe, expect, it } from "vitest";
import {
  isDirectToolExecutionEnabled,
  resolveOliviaEngineRoute,
} from "@/lib/olivia/v2/engineRouting";
import { classifyOliviaRequest } from "@/lib/olivia/v2/modelRouter";
import { isToolExecutionMiss } from "@/lib/olivia/v2/executionIntent";

const emptyContext = { recentActions: [], revision: 0 };

describe("Olivia Hermes-first 엔진 라우팅", () => {
  it("이전 직접 실행 플래그 값은 호환되게 읽는다", () => {
    expect(isDirectToolExecutionEnabled(undefined)).toBe(true);
    expect(isDirectToolExecutionEnabled("1")).toBe(true);
    expect(isDirectToolExecutionEnabled("0")).toBe(false);
  });

  it.each(["TOOL_ACTION", "FAST_COMMAND", "NORMAL_CHAT", "REASONING"] as const)(
    "Hermes 설정에서는 %s도 같은 Hermes conversation을 유지한다",
    (requestClass) => {
      expect(resolveOliviaEngineRoute({
        configuredEngine: "hermes",
        requestClass,
        directToolExecutionEnabled: true,
      })).toMatchObject({
        requestedEngine: "hermes",
        actualEngine: "hermes",
        useHermes: true,
        reason: "conversation",
      });
    },
  );

  it("확정적 응답과 DB fast path만 모델 호출 전에 직접 처리한다", () => {
    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass: "NORMAL_CHAT",
      directToolExecutionEnabled: true,
      deterministicAction: true,
    })).toMatchObject({ useHermes: false, reason: "deterministic_action" });

    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass: "NORMAL_CHAT",
      directToolExecutionEnabled: true,
      databaseFastPath: true,
    })).toMatchObject({ useHermes: false, reason: "database_fast_path" });
  });

  it("설정 엔진 자체가 legacy면 legacy를 유지한다", () => {
    expect(resolveOliviaEngineRoute({
      configuredEngine: "legacy",
      requestClass: "NORMAL_CHAT",
      directToolExecutionEnabled: false,
    })).toMatchObject({
      requestedEngine: "legacy",
      actualEngine: "legacy",
      useHermes: false,
      reason: "configured_legacy",
    });
  });

  it.each([
    "내일 오후 3시에 촬영 일정 추가해줘",
    "삼칠갈비 견적서 만들어줘",
    "미팅 내용을 메모로 저장해줘",
    "오케이 일단, 팝업 닫아줘",
    "종일로 잡아 줘",
    "종일로",
    "그걸로 해줘",
    "0918 삼칠갈비 원본 분리해줘",
    "삼칠갈비 씬별 분류해줘",
  ])("실제 실행 요청 '%s'도 Hermes 대화 경로를 유지한다", (message) => {
    const requestClass = classifyOliviaRequest(message, emptyContext);
    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass,
      directToolExecutionEnabled: true,
    }).useHermes).toBe(true);
  });

  it("도구 없이 불가/약속 답변을 내면 legacy 재시도 대상으로 판정한다", () => {
    expect(isToolExecutionMiss({
      message: "내일 3시 일정 등록해줘",
      responseText: "일정을 등록할게요.",
      toolCallCount: 0,
    })).toBe(true);
    expect(isToolExecutionMiss({
      message: "팝업 닫아줘",
      responseText: "화면을 바꾸는 기능이 연결되어 있지 않아요.",
      toolCallCount: 0,
    })).toBe(true);
    expect(isToolExecutionMiss({
      message: "내일 3시 일정 등록해줘",
      responseText: "일정을 등록했습니다.",
      toolCallCount: 1,
    })).toBe(false);
  });
});
