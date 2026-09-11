import { afterEach, describe, expect, it, vi } from "vitest";
import { getOliviaAgentEngine, isClientSearchRequest, isHermesFallbackSafe, isMutationIntent, runHermesChat } from "@/lib/hermes/client";
import { recordHermesClientSearch, recordHermesToolCall } from "@/lib/hermes/toolAudit";

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

  it("짧은 승인 답변도 mutation 가능 요청으로 취급한다", () => {
    expect(isMutationIntent("응")).toBe(true);
    expect(isMutationIntent("승인")).toBe(true);
  });

  it("OLIVIA_AGENT_ENGINE=hermes면 Hermes가 primary engine이다", () => {
    vi.stubEnv("OLIVIA_AGENT_ENGINE", "hermes");
    expect(getOliviaAgentEngine()).toBe("hermes");
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
        status: "FOUND",
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
        status: "NOT_FOUND",
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
        status: "AMBIGUOUS",
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

  it("MCP audit가 실패면 Hermes의 낙관적인 완료 문구를 차단한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const requestId = body.messages[0].content.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
      recordHermesToolCall(requestId, "memo.create", {
        success: false,
        mode: "mutation",
        error: "DB 저장 검증 실패",
        resourceType: "memo",
        verification: { persisted: false },
      });
      return sse("메모를 저장했습니다.");
    }));

    const result = await runHermesChat({ message: "메모해줘" });
    expect(result.message).toBe("요청을 완료하지 못했습니다. DB 저장 검증 실패");
    expect(result.toolCalls[0]).toMatchObject({
      name: "mcp_olivia_memo_create",
      success: false,
      resourceType: "memo",
      verification: { persisted: false },
    });
  });

  it("같은 요청의 실패 뒤 mutation 재시도가 검증 성공하면 최종 성공을 허용한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const requestId = body.messages[0].content.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
      recordHermesToolCall(requestId, "calendar.add", { success: false, mode: "mutation", error: "일시 오류" });
      recordHermesToolCall(requestId, "calendar.add", { success: true, mode: "mutation", data: { taskId: "task-1" }, verification: { executed: true, persisted: true } });
      return sse("일정을 등록했습니다.");
    }));
    expect((await runHermesChat({ message: "일정 넣어줘" })).message).toBe("일정을 등록했습니다.");
  });

  it("서로 다른 복합 mutation의 성공과 실패를 부분 성공으로 보고한다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const requestId = body.messages[0].content.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
      recordHermesToolCall(requestId, "create_quote", { success: true, mode: "mutation", data: { quoteId: "quote-1", summary: "견적서는 만들었습니다." }, verification: { executed: true, persisted: true } });
      recordHermesToolCall(requestId, "calendar_add", { success: false, mode: "mutation", error: "일정 시간이 저장되지 않았습니다." });
      return sse("두 작업을 모두 완료했습니다.");
    }));
    const result = await runHermesChat({ message: "견적 만들고 일정도 넣어줘" });
    expect(result.message).toContain("견적서는 만들었습니다.");
    expect(result.message).toContain("일정 시간이 저장되지 않았습니다.");
    expect(result.message).not.toContain("모두 완료");
  });

  it("mutation tool 실행 없이 완료를 주장하면 완료 여부를 확정하지 않는다", async () => {
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => sse("일정을 등록했습니다.")));
    expect((await runHermesChat({ message: "일정 넣어줘" })).message).toBe("실제 Olivia Tool 실행 결과를 확인하지 못해 완료 여부를 확정할 수 없습니다.");
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
