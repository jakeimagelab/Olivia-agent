import { afterEach, describe, expect, it, vi } from "vitest";
import { isClientSearchRequest, isHermesFallbackSafe, runHermesChat } from "@/lib/hermes/client";
import { recordHermesClientSearch } from "@/lib/hermes/toolAudit";

function sse(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("Hermes chat adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("고객 검색 표현을 감지한다", () => {
    expect(isClientSearchRequest("강재활의학과 찾아줘")).toBe(true);
    expect(isClientSearchRequest("강재활 검색해줘")).toBe(true);
    expect(isClientSearchRequest("오늘 기분 어때?")).toBe(false);
  });

  it("MCP 도구 실행 검증이 있으면 검색 결과를 반환한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      const system = body.messages.find((message) => message.role === "system")?.content ?? "";
      const requestId = system.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
      expect(requestId).toBeTruthy();
      recordHermesClientSearch(requestId, { success: true, result: {
        success: true,
        clients: [{ id: "1", name: "강재활의학과" }],
        verification: { executed: true, resourceExists: true, verifiedAt: new Date().toISOString() },
      } });
      return sse("강재활의학과가 등록되어 있습니다.");
    }));

    const result = await runHermesChat({ message: "강재활의학과 찾아줘" });
    expect(result.message).toContain("강재활의학과");
    expect(result.data?.verification.executed).toBe(true);
    expect(result.toolCalls[0]).toMatchObject({ name: "mcp_olivia_client_search", success: true });
  });

  it("도구 실행 없이 고객 존재를 주장하면 차단한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => sse("찾았습니다.")));
    await expect(runHermesChat({ message: "강재활의학과 찾아줘" }))
      .rejects.toThrow("고객검색 도구 실행이 필요합니다.");
  });

  it("도구가 실행됐어도 DB 검색 실패면 성공 응답을 차단한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      const requestId = body.messages[0].content.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
      recordHermesClientSearch(requestId, { success: false, error: "고객 검색에 실패했습니다." });
      return sse("찾았습니다.");
    }));
    await expect(runHermesChat({ message: "강재활의학과 찾아줘" }))
      .rejects.toThrow("고객 검색에 실패했습니다.");
  });

  it("검색 0건은 지정된 문구로 확정한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const requestId = body.messages[0].content.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
      recordHermesClientSearch(requestId, { success: true, result: {
        success: true,
        clients: [],
        verification: { executed: true, resourceExists: false, verifiedAt: new Date().toISOString() },
      } });
      return sse("없는 것 같아요.");
    }));
    const result = await runHermesChat({ message: "존재하지않는병원123 찾아줘" });
    expect(result.message).toBe("등록된 고객에서 찾지 못했습니다.");
  });

  it("복수 검색 결과는 모든 후보를 보여준다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const requestId = body.messages[0].content.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
      recordHermesClientSearch(requestId, { success: true, result: {
        success: true,
        clients: [{ id: "1", name: "강재활 강남점" }, { id: "2", name: "강재활 송파점" }],
        verification: { executed: true, resourceExists: true, verifiedAt: new Date().toISOString() },
      } });
      return sse("강재활 강남점입니다.");
    }));
    const result = await runHermesChat({ message: "강재활 찾아줘" });
    expect(result.message).toContain("1. 강재활 강남점");
    expect(result.message).toContain("2. 강재활 송파점");
  });

  it("일반 대화는 고객검색 도구 없이 통과한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => sse("안녕하세요.")));
    const result = await runHermesChat({ message: "안녕" });
    expect(result.message).toBe("안녕하세요.");
  });

  it("uses the canonical conversation session and mixed-channel DB history", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      expect(headers["X-Hermes-Session-Key"]).toBe("olivia:conversation-uuid");
      expect(body.messages).toEqual(expect.arrayContaining([
        { role: "user", content: "Desktop에서 견적서를 열어줘" },
        { role: "assistant", content: "견적서를 열었습니다." },
        { role: "user", content: "그 견적 금액 알려줘" },
      ]));
      return sse("금액을 확인했어요.");
    }));
    const result = await runHermesChat({
      message: "그 견적 금액 알려줘",
      conversationId: "conversation-uuid",
      history: [
        { role: "user", content: "Desktop에서 견적서를 열어줘" },
        { role: "assistant", content: "견적서를 열었습니다." },
      ],
    });
    expect(result.message).toBe("금액을 확인했어요.");
  });

  it("연결 전 실패만 cloud fallback에 안전하다고 표시한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("connection refused"); }));
    const error = await runHermesChat({ message: "안녕" }).catch((caught) => caught);
    expect(isHermesFallbackSafe(error)).toBe(true);
  });

  it("응답 스트림이 시작된 뒤 실패하면 cloud fallback을 차단한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"진행"}}]}\n\n'));
        controller.error(new Error("stream interrupted"));
      },
    }), { status: 200 })));
    const error = await runHermesChat({ message: "안녕" }).catch((caught) => caught);
    expect(isHermesFallbackSafe(error)).toBe(false);
  });
});
