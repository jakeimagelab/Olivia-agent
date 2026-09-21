import { describe, expect, it } from "vitest";
import {
  isDirectToolExecutionEnabled,
  resolveOliviaEngineRoute,
} from "@/lib/olivia/v2/engineRouting";
import { classifyOliviaRequest } from "@/lib/olivia/v2/modelRouter";
import { isUiExecutionIntent } from "@/lib/hermes/client";

const emptyContext = { recentActions: [], revision: 0 };

describe("Olivia 직접 도구 실행 엔진 라우팅", () => {
  it("직접 실행은 기본으로 켜지고 정확히 0일 때만 꺼진다", () => {
    expect(isDirectToolExecutionEnabled(undefined)).toBe(true);
    expect(isDirectToolExecutionEnabled("1")).toBe(true);
    expect(isDirectToolExecutionEnabled("0")).toBe(false);
  });

  it.each([
    ["TOOL_ACTION", "tool_action"],
    ["FAST_COMMAND", "fast_command"],
  ] as const)("Hermes 설정이어도 %s는 Olivia legacy 실행기로 보낸다", (requestClass, reason) => {
    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass,
      directToolExecutionEnabled: true,
    })).toMatchObject({
      requestedEngine: "hermes",
      actualEngine: "legacy",
      useHermes: false,
      reason,
    });
  });

  it("확정적 UI 동작과 DB fast path도 Hermes보다 Olivia를 우선한다", () => {
    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass: "NORMAL_CHAT",
      directToolExecutionEnabled: true,
      deterministicAction: true,
    }).reason).toBe("deterministic_action");

    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass: "NORMAL_CHAT",
      directToolExecutionEnabled: true,
      databaseFastPath: true,
    }).reason).toBe("database_fast_path");

    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass: "NORMAL_CHAT",
      directToolExecutionEnabled: true,
      uiExecutionIntent: true,
    }).reason).toBe("ui_execution");
  });

  it.each(["NORMAL_CHAT", "REASONING"] as const)("%s는 Hermes 대화 경로를 유지한다", (requestClass) => {
    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass,
      directToolExecutionEnabled: true,
    })).toMatchObject({ actualEngine: "hermes", useHermes: true, reason: "conversation" });
  });

  it("환경변수로 우회를 끄면 TOOL_ACTION도 기존 Hermes MCP 경로로 복귀한다", () => {
    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass: "TOOL_ACTION",
      directToolExecutionEnabled: false,
      deterministicAction: true,
    })).toMatchObject({
      actualEngine: "hermes",
      useHermes: true,
      reason: "direct_execution_disabled",
    });
  });

  it("설정 엔진 자체가 legacy면 환경변수와 무관하게 legacy를 유지한다", () => {
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
    "0918 삼칠갈비 원본 분리해줘",
    "삼칠갈비 씬별 분류해줘",
  ])("실제 실행 요청 '%s'는 Hermes가 아니라 Olivia 도구 경로로 간다", (message) => {
    const requestClass = classifyOliviaRequest(message, emptyContext);
    expect(resolveOliviaEngineRoute({
      configuredEngine: "hermes",
      requestClass,
      directToolExecutionEnabled: true,
      uiExecutionIntent: isUiExecutionIntent(message),
    }).useHermes).toBe(false);
  });

  it("화면 열기 요청은 분류 결과와 무관하게 UI 실행 의도로 직접 처리한다", () => {
    for (const message of ["사진작업실 열어", "이 창 닫아줘"]) {
      expect(resolveOliviaEngineRoute({
        configuredEngine: "hermes",
        requestClass: classifyOliviaRequest(message, emptyContext),
        directToolExecutionEnabled: true,
        uiExecutionIntent: isUiExecutionIntent(message),
      })).toMatchObject({ useHermes: false, reason: "ui_execution" });
    }
  });
});
