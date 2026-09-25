import { describe, expect, it } from "vitest";
import {
  buildAssistantEngineMetadata,
  isHermesFallbackMetadata,
  normalizePersistedAgentEngine,
} from "./fallbackMetadata";

describe("Hermes fallback metadata", () => {
  it("호출부의 cloud override를 버리고 route의 실제 engine을 저장한다", () => {
    expect(buildAssistantEngineMetadata(
      { agentEngine: "cloud", fallbackReason: "stale", model: "gpt" },
      { agentEngine: "legacy", fallbackReason: "connect timeout" },
    )).toEqual({ model: "gpt", agentEngine: "legacy", fallbackReason: "connect timeout" });
  });

  it("정상 Hermes와 설정상 legacy 턴에는 fallbackReason을 만들지 않는다", () => {
    expect(buildAssistantEngineMetadata({}, { agentEngine: "hermes" })).toEqual({ agentEngine: "hermes" });
    expect(buildAssistantEngineMetadata({}, { agentEngine: "legacy" })).toEqual({ agentEngine: "legacy" });
  });

  it("과거 cloud 폴백 메시지를 legacy로 호환 복원한다", () => {
    expect(normalizePersistedAgentEngine("cloud", "idle timeout")).toBe("legacy");
    expect(normalizePersistedAgentEngine("cloud")).toBeUndefined();
  });

  it("fallbackReason이 실제로 있을 때만 폴백 메타데이터로 본다", () => {
    expect(isHermesFallbackMetadata({ fallbackReason: "connect timeout" })).toBe(true);
    expect(isHermesFallbackMetadata({ agentEngine: "legacy" })).toBe(false);
    expect(isHermesFallbackMetadata({ fallbackReason: "  " })).toBe(false);
  });
});
