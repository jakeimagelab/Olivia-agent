import { buildHermesSystemPrompt } from "@/lib/hermes/systemPrompt";
import { consumeHermesClientSearch, consumeHermesToolCalls } from "@/lib/hermes/toolAudit";
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

export function getOliviaAgentEngine(): "legacy" | "hermes" {
  return process.env.OLIVIA_AGENT_ENGINE?.trim().toLowerCase() === "hermes" ? "hermes" : "legacy";
}

function getHermesConfig() {
  const baseUrl = process.env.HERMES_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.HERMES_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("Hermes Agent 환경변수 설정을 확인해주세요.");
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
    if (controller.signal.aborted && !input.signal?.aborted) throw new Error("Hermes Agent 응답 시간이 초과되었습니다.");
    throw new Error("Hermes Agent에 연결할 수 없습니다. Mac Studio Hermes Server 상태를 확인해주세요.");
  }

  if (!response.ok || !response.body) {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
    throw new Error(response.status === 401
      ? "Hermes Agent 인증 설정을 확인해주세요."
      : "Hermes Agent에 연결할 수 없습니다. Mac Studio Hermes Server 상태를 확인해주세요.");
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
      if (name === CLIENT_SEARCH_TOOL && !toolCalls.has(id)) {
        const record = { id, name, success: false };
        toolCalls.set(id, record);
        input.callbacks?.onToolStart?.(name, id);
      }
      if (name === CLIENT_SEARCH_TOOL && /complete|success|done/i.test(status ?? "")) {
        const record = toolCalls.get(id) ?? { id, name, success: true };
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
    if (controller.signal.aborted && !input.signal?.aborted) throw new Error("Hermes Agent 응답 시간이 초과되었습니다.");
    throw new Error("Hermes Agent 응답을 받는 중 문제가 발생했습니다.");
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

  if (verifiedSearch?.clients.length === 0) {
    finalText = "등록된 고객에서 찾지 못했습니다.";
  } else if (verifiedSearch && verifiedSearch.clients.length > 1) {
    finalText = `등록 고객 후보가 ${verifiedSearch.clients.length}곳 있습니다.\n${verifiedSearch.clients
      .map((client, index) => `${index + 1}. ${client.name}${client.specialty ? ` · ${client.specialty}` : ""}`)
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
