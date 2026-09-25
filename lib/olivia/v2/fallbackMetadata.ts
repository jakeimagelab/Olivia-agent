export type OliviaAgentEngine = "hermes" | "legacy";

export function buildAssistantEngineMetadata(
  metadata: Record<string, unknown>,
  input: { agentEngine: OliviaAgentEngine; fallbackReason?: string },
): Record<string, unknown> {
  const next = { ...metadata };
  delete next.agentEngine;
  delete next.fallbackReason;
  return {
    ...next,
    agentEngine: input.agentEngine,
    ...(input.fallbackReason?.trim() ? { fallbackReason: input.fallbackReason.trim() } : {}),
  };
}

export function normalizePersistedAgentEngine(
  value: unknown,
  fallbackReason?: string,
): OliviaAgentEngine | undefined {
  if (value === "hermes" || value === "legacy") return value;
  // Phase 4 초기 배포는 legacy OpenAI 경로를 "cloud"로 저장했다. fallbackReason이 함께
  // 있으면 실제 Hermes 폴백이므로 과거 메시지도 올바른 엔진 의미로 복원한다.
  if (fallbackReason?.trim()) return "legacy";
  return undefined;
}

export function isHermesFallbackMetadata(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reason = (value as Record<string, unknown>).fallbackReason;
  return typeof reason === "string" && Boolean(reason.trim());
}
