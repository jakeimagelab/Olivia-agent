import type { OliviaRequestClass } from "@/lib/olivia/v2/modelRouter";

export type OliviaConfiguredEngine = "hermes" | "legacy";
export type OliviaExecutionEngine = "hermes" | "legacy";

export type OliviaEngineRouteReason =
  | "configured_legacy"
  | "deterministic_action"
  | "database_fast_path"
  | "command_direct"
  | "conversation";

export type OliviaEngineRoute = {
  requestedEngine: OliviaConfiguredEngine;
  actualEngine: OliviaExecutionEngine;
  useHermes: boolean;
  directToolExecutionEnabled: boolean;
  reason: OliviaEngineRouteReason;
};

/**
 * 과거 Hermes MCP 장애 우회 플래그다. 현재는 호환성과 진단 로그를 위해 값을 읽되,
 * 메시지마다 엔진을 바꾸는 용도로 쓰지 않는다. 사진 직접 실행은 별도의
 * OLIVIA_PHOTO_DIRECT_EXECUTION 플래그만 사용한다.
 */
export function isDirectToolExecutionEnabled(
  value = process.env.OLIVIA_DIRECT_TOOL_EXECUTION,
): boolean {
  return value?.trim() !== "0";
}

export function resolveOliviaEngineRoute(input: {
  configuredEngine: OliviaConfiguredEngine;
  requestClass: OliviaRequestClass;
  directToolExecutionEnabled: boolean;
  deterministicAction?: boolean;
  databaseFastPath?: boolean;
  uiExecutionIntent?: boolean;
}): OliviaEngineRoute {
  if (input.configuredEngine === "legacy") {
    return {
      requestedEngine: "legacy",
      actualEngine: "legacy",
      useHermes: false,
      directToolExecutionEnabled: input.directToolExecutionEnabled,
      reason: "configured_legacy",
    };
  }

  const directReason: OliviaEngineRouteReason | undefined =
    input.deterministicAction ? "deterministic_action"
      : input.databaseFastPath ? "database_fast_path" : undefined;

  if (directReason) {
    return {
      requestedEngine: "hermes",
      actualEngine: "legacy",
      useHermes: false,
      directToolExecutionEnabled: input.directToolExecutionEnabled,
      reason: directReason,
    };
  }

  // 명령은 헤르메스로 보내지 않는다. 도구 하나로 끝나는 요청에 코덱스 추론과
  // 도구 설명 24,000토큰을 매번 태우면 52초 제한에 걸린다(2026-09-28).
  // legacy 는 이미 헤르메스 폴백 경로라 실행 요청을 다룰 수 있다.
  if (input.requestClass === "TOOL_ACTION"
    || input.requestClass === "FAST_COMMAND"
    || input.uiExecutionIntent) {
    return {
      requestedEngine: "hermes",
      actualEngine: "legacy",
      useHermes: false,
      directToolExecutionEnabled: input.directToolExecutionEnabled,
      reason: "command_direct",
    };
  }

  return {
    requestedEngine: "hermes",
    actualEngine: "hermes",
    useHermes: true,
    directToolExecutionEnabled: input.directToolExecutionEnabled,
    reason: "conversation",
  };
}
