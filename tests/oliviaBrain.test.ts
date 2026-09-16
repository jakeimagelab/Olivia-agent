import { afterEach, describe, expect, it, vi } from "vitest";
import { hermesProvider, isBrainFallbackSafe } from "@/lib/assistant/brain";
import { BrainUnavailableError } from "@/lib/assistant/brain/types";

function sse(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// hermesProvider는 lib/hermes/client.ts의 runHermesChat()을 그대로 감싸기만 한다 —
// 그 안의 SSE 파싱/tool audit 로직은 tests/hermesClient.test.ts가 이미 폭넓게 검증한다.
// 여기서는 OliviaBrain 계약(BrainChatResult 모양, 에러 변환)만 검증한다.
describe("hermesProvider (OliviaBrain)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("declares itself as the hermes engine", () => {
    expect(hermesProvider.engine).toBe("hermes");
  });

  it("wraps a successful Hermes turn into a message-shaped BrainChatResult", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => sse("안녕하세요.")));

    const result = await hermesProvider.chat({ conversationId: "conv-1", message: "안녕" });
    expect(result).toMatchObject({ type: "message", text: "안녕하세요." });
    if (result.type !== "message") throw new Error("unreachable");
    expect(result.runId).toBeTruthy();
    expect(Array.isArray(result.toolCalls)).toBe(true);
  });

  it("translates a connection failure into a fallback-safe BrainUnavailableError", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("connection refused"); }));

    const error = await hermesProvider.chat({ conversationId: "conv-1", message: "안녕" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(BrainUnavailableError);
    expect(isBrainFallbackSafe(error)).toBe(true);
  });

  it("does not mark a mid-stream failure as fallback-safe (partial output already shown)", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"진행"}}]}\n\n'));
        controller.error(new Error("stream interrupted"));
      },
    }), { status: 200 })));

    const error = await hermesProvider.chat({ conversationId: "conv-1", message: "안녕" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(BrainUnavailableError);
    expect(isBrainFallbackSafe(error)).toBe(false);
  });

  it("isBrainFallbackSafe safely rejects unrelated errors", () => {
    expect(isBrainFallbackSafe(new Error("something else"))).toBe(false);
    expect(isBrainFallbackSafe("not an error")).toBe(false);
  });
});
