import { buildHermesSystemPrompt } from "@/lib/hermes/systemPrompt";
import { consumeHermesClientSearch, consumeHermesToolCalls } from "@/lib/hermes/toolAudit";
import type { OliviaClientSearchResult } from "@/lib/olivia/clientSearch";
import type {
  HermesCallbacks,
  HermesChatContext,
  HermesChatMessage,
  HermesChatResult,
  HermesToolCallRecord,
} from "@/lib/hermes/types";

const HERMES_TIMEOUT_MS = 60_000;
const CLIENT_SEARCH_TOOL = "mcp_olivia_client_search";
// Quote tool 6종 — MCP 서버 이름이 "olivia"라 Hermes가 진행 이벤트에서 client.search와 같은
// mcp_olivia_<tool> 규칙으로 이름을 보낸다고 가정한다. 이 목록은 진행 상태(onToolStart) 표시용일
// 뿐이고, 실제 성공/실패 판정은 아래 consumeHermesToolCalls()가 requestId로 돌려주는 감사 기록
// (내가 만든 MCP handler가 직접 기록한 ground truth)로 한다 — SSE 이름 매칭이 어긋나도 검증은 안 깨진다.
const QUOTE_TOOL_NAMES = ["create_quote", "add_quote_item", "update_quote_item", "remove_quote_item", "apply_quote_discount", "publish_quote"];
const QUOTE_MCP_TOOLS = new Set(QUOTE_TOOL_NAMES.map((name) => `mcp_olivia_${name}`));

export class HermesChatError extends Error {
  constructor(message: string, public readonly fallbackSafe: boolean) {
    super(message);
    this.name = "HermesChatError";
  }
}

export function isHermesFallbackSafe(error: unknown): boolean {
  return error instanceof HermesChatError && error.fallbackSafe;
}

export function getOliviaAgentEngine(): "legacy" | "hermes" {
  return process.env.OLIVIA_AGENT_ENGINE?.trim().toLowerCase() === "hermes" ? "hermes" : "legacy";
}

function getHermesConfig() {
  const baseUrl = process.env.HERMES_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.HERMES_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new HermesChatError("Hermes Agent 환경변수 설정을 확인해주세요.", true);
  return { baseUrl, apiKey, model: process.env.HERMES_MODEL?.trim() || "hermes-agent" };
}

export function isClientSearchRequest(message: string) {
  return /(찾아|검색|조회|등록.*(?:고객|병원|의원|클리닉)|(?:고객|병원|의원|클리닉).*있[어는나]?)/i.test(message);
}

function eventValue(payload: unknown, keys: string[]): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return undefined;
}

function normalizeToolName(name: string | undefined) {
  return name?.replaceAll(".", "_");
}

export async function runHermesChat(input: {
  message: string;
  history?: HermesChatMessage[];
  conversationId?: string;
  context?: HermesChatContext;
  signal?: AbortSignal;
  callbacks?: HermesCallbacks;
}): Promise<HermesChatResult> {
  const config = getHermesConfig();
  const requestId = crypto.randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HERMES_TIMEOUT_MS);
  const abort = () => controller.abort();
  input.signal?.addEventListener("abort", abort, { once: true });

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(input.conversationId ? { "X-Hermes-Session-Key": `olivia:${input.conversationId}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        messages: [
          { role: "system", content: buildHermesSystemPrompt(requestId, input.context) },
          ...(input.history ?? []).slice(-12),
          { role: "user", content: input.message },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
    if (controller.signal.aborted && !input.signal?.aborted) throw new HermesChatError("Hermes Agent 응답 시간이 초과되었습니다.", true);
    throw new HermesChatError("Hermes Agent에 연결할 수 없습니다. Mac Studio Hermes Server 상태를 확인해주세요.", true);
  }

  if (!response.ok || !response.body) {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
    throw new HermesChatError(response.status === 401
      ? "Hermes Agent 인증 설정을 확인해주세요."
      : "Hermes Agent에 연결할 수 없습니다. Mac Studio Hermes Server 상태를 확인해주세요.", true);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<string, HermesToolCallRecord>();
  const searchRequest = isClientSearchRequest(input.message);
  let buffer = "";
  let finalText = "";

  const handleEvent = (block: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    const raw = dataLines.join("\n");
    if (!raw || raw === "[DONE]") return;
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return; }

    if (eventName === "hermes.tool.progress") {
      const name = normalizeToolName(eventValue(payload, ["tool_name", "tool", "name"]));
      const id = eventValue(payload, ["tool_call_id", "toolCallId", "id"]) || crypto.randomUUID();
      const status = eventValue(payload, ["status", "phase", "state"]);
      const tracked = name === CLIENT_SEARCH_TOOL || (name !== undefined && QUOTE_MCP_TOOLS.has(name));
      if (tracked && !toolCalls.has(id)) {
        const record = { id, name: name as string, success: false };
        toolCalls.set(id, record);
        input.callbacks?.onToolStart?.(name as string, id);
      }
      if (tracked && /complete|success|done/i.test(status ?? "")) {
        const record = toolCalls.get(id) ?? { id, name: name as string, success: true };
        record.success = true;
        toolCalls.set(id, record);
      }
      return;
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const choices = (payload as { choices?: Array<{ delta?: { content?: unknown } }> }).choices;
    const content = choices?.[0]?.delta?.content;
    if (typeof content === "string" && content) {
      finalText += content;
      if (!searchRequest) input.callbacks?.onTextDelta?.(content);
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        handleEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) handleEvent(buffer);
  } catch {
    if (controller.signal.aborted && !input.signal?.aborted) throw new HermesChatError("Hermes Agent 응답 시간이 초과되었습니다.", false);
    throw new HermesChatError("Hermes Agent 응답을 받는 중 문제가 발생했습니다.", false);
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
  }

  const searchAudit = consumeHermesClientSearch(requestId);
  if (searchRequest && !searchAudit) {
    throw new Error("고객 정보를 확인하려면 고객검색 도구 실행이 필요합니다.");
  }
  if (searchAudit && !searchAudit.success) throw new Error("고객 검색에 실패했습니다.");
  const verifiedSearch = searchAudit?.success ? searchAudit.result : undefined;

  if (verifiedSearch) {
    const existing = [...toolCalls.values()].find((call) => call.name === CLIENT_SEARCH_TOOL);
    const record: HermesToolCallRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      name: CLIENT_SEARCH_TOOL,
      success: true,
      result: verifiedSearch,
    };
    toolCalls.set(record.id, record);
    input.callbacks?.onToolResult?.(record);
  }

  // client.search와 달리 quote tool은 실행 여부가 강제되지 않는다(모든 대화가 견적 작업은
  // 아니므로) — 대신 실제로 호출된 것만 ground truth(내 MCP handler가 직접 기록한 감사)로
  // toolCalls에 반영한다. Hermes의 finalText는 그대로 두고 rewrite하지 않는다.
  for (const audit of consumeHermesToolCalls(requestId)) {
    const mcpName = `mcp_olivia_${audit.toolName}`;
    const existing = [...toolCalls.values()].find((call) => call.name === mcpName);
    const record: HermesToolCallRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      name: mcpName,
      success: audit.result.success,
      ...(audit.result.success ? { data: audit.result.data } : { error: audit.result.error }),
    };
    toolCalls.set(record.id, record);
    input.callbacks?.onToolResult?.(record);
  }

  if (verifiedSearch?.clients.length === 0) {
    finalText = "등록된 고객에서 찾지 못했습니다.";
  } else if (verifiedSearch && verifiedSearch.clients.length > 1) {
    finalText = `등록 고객 후보가 ${verifiedSearch.clients.length}곳 있습니다.\n${verifiedSearch.clients
      .map((client: OliviaClientSearchResult["clients"][number], index: number) => `${index + 1}. ${client.name}${client.specialty ? ` · ${client.specialty}` : ""}`)
      .join("\n")}`;
  } else if (verifiedSearch?.clients.length === 1 && !finalText.includes(verifiedSearch.clients[0].name)) {
    finalText = `${verifiedSearch.clients[0].name} 고객을 찾았습니다.`;
  } else if (!finalText.trim()) {
    finalText = "응답을 생성하지 못했습니다.";
  }
  if (searchRequest) input.callbacks?.onTextDelta?.(finalText);

  return {
    success: true,
    message: finalText,
    runId: requestId,
    toolCalls: [...toolCalls.values()],
    ...(verifiedSearch ? { data: verifiedSearch } : {}),
  };
}
