import type { OliviaRequestClass } from "@/lib/olivia/v2/modelRouter";

export type OliviaConfiguredEngine = "hermes" | "legacy";
export type OliviaExecutionEngine = "hermes" | "legacy";

export type OliviaEngineRouteReason =
  | "configured_legacy"
  | "direct_execution_disabled"
  | "tool_action"
  | "fast_command"
  | "deterministic_action"
  | "database_fast_path"
  | "ui_execution"
  | "conversation";

export type OliviaEngineRoute = {
  requestedEngine: OliviaConfiguredEngine;
  actualEngine: OliviaExecutionEngine;
  useHermes: boolean;
  directToolExecutionEnabled: boolean;
  reason: OliviaEngineRouteReason;
};

/**
 * Hermes API Server의 MCP 호출이 복구되면 값 하나로 기존 경로에 복귀한다.
 * 새 배포가 별도 환경변수 설정 없이 즉시 안전한 Olivia 실행 경로를 사용하도록
 * 기본값은 ON이며, 정확히 "0"일 때만 끈다.
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

  if (!input.directToolExecutionEnabled) {
    return {
      requestedEngine: "hermes",
      actualEngine: "hermes",
      useHermes: true,
      directToolExecutionEnabled: false,
      reason: "direct_execution_disabled",
    };
  }

  const directReason: OliviaEngineRouteReason | undefined =
    input.deterministicAction ? "deterministic_action"
      : input.databaseFastPath ? "database_fast_path"
        : input.uiExecutionIntent ? "ui_execution"
          : input.requestClass === "TOOL_ACTION" ? "tool_action"
            : input.requestClass === "FAST_COMMAND" ? "fast_command"
              : undefined;

  if (directReason) {
    return {
      requestedEngine: "hermes",
      actualEngine: "legacy",
      useHermes: false,
      directToolExecutionEnabled: true,
      reason: directReason,
    };
  }

  return {
    requestedEngine: "hermes",
    actualEngine: "hermes",
    useHermes: true,
    directToolExecutionEnabled: true,
    reason: "conversation",
  };
}
