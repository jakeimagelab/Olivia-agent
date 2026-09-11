import { buildHermesSystemPrompt } from "@/lib/hermes/systemPrompt";
import { consumeHermesClientSearch, consumeHermesToolCalls } from "@/lib/hermes/toolAudit";
import { clearHermesExecutionContext, registerHermesExecutionContext } from "@/lib/hermes/executionContext";
import type {
  HermesCallbacks,
  HermesChatContext,
  HermesChatMessage,
  HermesChatResult,
  HermesToolCallRecord,
} from "@/lib/hermes/types";

const HERMES_TIMEOUT_MS = 60_000;

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

export function isMutationIntent(message: string) {
  return /(추가|등록|생성|만들|수정|변경|삭제|저장|메모|완료|확정|발행|공개|넣어|남겨)/i.test(message)
    || /^\s*(응|네|예|그래|좋아|진행해|확인|승인)(?:\s*[.!])?\s*$/i.test(message);
}

export function claimsMutationCompletion(message: string) {
  return /(추가|등록|생성|만들|수정|변경|삭제|저장|완료|확정|발행|공개)(?:했|됐|되었습니다|했습니다|했어요|됐어요)/i.test(message);
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
  registerHermesExecutionContext(requestId, input.context ?? { recentActions: [], revision: 0 }, input.conversationId);
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
    clearHermesExecutionContext(requestId);
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
    if (controller.signal.aborted && !input.signal?.aborted) throw new HermesChatError("Hermes Agent 응답 시간이 초과되었습니다.", true);
    throw new HermesChatError("Hermes Agent에 연결할 수 없습니다. Mac Studio Hermes Server 상태를 확인해주세요.", true);
  }

  if (!response.ok || !response.body) {
    clearHermesExecutionContext(requestId);
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
  const mutationRequest = isMutationIntent(input.message);
  const guardedResponse = searchRequest || mutationRequest;
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
      const tracked = name?.startsWith("mcp_olivia_") === true;
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
      if (!guardedResponse) input.callbacks?.onTextDelta?.(content);
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
    clearHermesExecutionContext(requestId);
    if (controller.signal.aborted && !input.signal?.aborted) throw new HermesChatError("Hermes Agent 응답 시간이 초과되었습니다.", false);
    throw new HermesChatError("Hermes Agent 응답을 받는 중 문제가 발생했습니다.", false);
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
  }

  const searchAudit = consumeHermesClientSearch(requestId);
  if (searchRequest && !searchAudit) {
    clearHermesExecutionContext(requestId);
    throw new Error("고객 정보를 확인하려면 고객검색 도구 실행이 필요합니다.");
  }
  if (searchAudit && !searchAudit.success) {
    clearHermesExecutionContext(requestId);
    throw new Error(searchAudit.error || "고객 검색에 실패했습니다.");
  }
  const verifiedSearch = searchAudit?.success ? searchAudit.result : undefined;

  // 실제로 호출된 도구만 MCP handler의 감사 기록을 ground truth로 반영한다.
  const toolAudits = consumeHermesToolCalls(requestId);
  for (const audit of toolAudits) {
    const mcpName = `mcp_olivia_${audit.toolName.replaceAll(".", "_")}`;
    const existing = [...toolCalls.values()].find((call) => call.name === mcpName);
    const record: HermesToolCallRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      name: mcpName,
      success: audit.result.success,
      ...(audit.result.success ? { data: audit.result.data } : { error: audit.result.error }),
      mode: audit.result.mode,
      uiToolName: audit.result.uiToolName,
      ...(!audit.result.success ? { code: audit.result.code, details: audit.result.details } : {}),
      resourceType: audit.result.resourceType,
      resourceId: audit.result.resourceId,
      changedEntityId: audit.result.changedEntityId,
      verification: audit.result.verification,
      uiActions: audit.result.uiActions,
    };
    toolCalls.set(record.id, record);
    input.callbacks?.onToolResult?.(record);
  }

  // client.search는 초기 Hermes 연동부터 별도의 엄격한 감사 계약을 사용한다.
  // 범용 audit과 함께 기록되는 실제 MCP 호출은 같은 record를 보강하고,
  // 이전 bridge처럼 전용 audit만 남긴 호출도 계속 검증한다.
  if (verifiedSearch) {
    const clientSearchName = "mcp_olivia_client_search";
    const existing = [...toolCalls.values()].find((call) => call.name === clientSearchName);
    const record: HermesToolCallRecord = {
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      name: clientSearchName,
      success: true,
      mode: "read",
      result: verifiedSearch,
      data: verifiedSearch,
      resourceType: "client",
      verification: verifiedSearch.verification,
    };
    toolCalls.set(record.id, record);
    if (!existing) input.callbacks?.onToolResult?.(record);
  }

  const mutationAudits = toolAudits.filter((audit) => audit.result.mode === "mutation");
  // 같은 도구의 앞선 실패 뒤 재시도가 성공한 경우에는 마지막 실행이 authoritative하다.
  // 서로 다른 도구가 섞인 복합 요청은 각 도구의 마지막 결과를 보존해 부분 성공을 판정한다.
  const finalMutationByTool = new Map<string, (typeof mutationAudits)[number]>();
  for (const audit of mutationAudits) finalMutationByTool.set(audit.toolName, audit);
  const finalMutationAudits = [...finalMutationByTool.values()];
  const failedMutations = finalMutationAudits.filter((audit) => !audit.result.success);
  const successfulMutations = finalMutationAudits.filter((audit) => audit.result.success);
  if (!finalText.trim()) {
    finalText = "응답을 생성하지 못했습니다.";
  }
  // Hermes의 자연어가 낙관적으로 작성되더라도 Olivia MCP의 감사 결과가 실패라면
  // 완료 문구를 그대로 전달하지 않는다. Tool audit이 최종 응답의 ground truth다.
  if (failedMutations.length > 0 && successfulMutations.length > 0) {
    const completed = successfulMutations
      .map((audit) => {
        const data = audit.result.data;
        return data && typeof data === "object" && !Array.isArray(data) && typeof (data as Record<string, unknown>).summary === "string"
          ? (data as Record<string, unknown>).summary as string
          : undefined;
      })
      .filter((summary): summary is string => Boolean(summary));
    const failures = failedMutations.map((audit) => audit.result.success ? undefined : audit.result.error).filter(Boolean);
    finalText = `${completed.length > 0 ? completed.join(" ") : "일부 작업은 완료했습니다."}\n완료하지 못한 작업이 있습니다: ${failures.join(" / ")}`;
  } else if (failedMutations.length > 0) {
    const finalMutationAudit = failedMutations.at(-1)!;
    const failedResult = finalMutationAudit.result;
    if (failedResult.success) throw new Error("Hermes Tool 감사 결과를 판정하지 못했습니다.");
    if (failedResult.code === "PARTIAL_SUCCESS") {
      const data = failedResult.data as { requestedCount?: number; successCount?: number; failedCount?: number } | undefined;
      finalText = data?.requestedCount != null
        ? `${data.requestedCount}건 중 ${data.successCount ?? 0}건 저장, ${data.failedCount ?? 0}건 실패했습니다. ${failedResult.error}`
        : `일부 단계만 완료되었습니다. ${failedResult.error}`;
    } else {
      finalText = `요청을 완료하지 못했습니다. ${failedResult.error}`;
    }
  } else if (mutationRequest && mutationAudits.length === 0 && claimsMutationCompletion(finalText)) {
    finalText = "실제 Olivia Tool 실행 결과를 확인하지 못해 완료 여부를 확정할 수 없습니다.";
  }

  if (verifiedSearch?.clients.length === 0) {
    finalText = "등록된 고객에서 찾지 못했습니다.";
  } else if (verifiedSearch && verifiedSearch.clients.length > 1) {
    finalText = `등록 고객 후보가 ${verifiedSearch.clients.length}곳 있습니다.\n${verifiedSearch.clients
      .map((client, index) => `${index + 1}. ${client.name}${client.specialty ? ` · ${client.specialty}` : ""}`)
      .join("\n")}`;
  } else if (verifiedSearch?.clients.length === 1 && !finalText.includes(verifiedSearch.clients[0].name)) {
    finalText = `${verifiedSearch.clients[0].name} 고객을 찾았습니다.`;
  }

  if (guardedResponse) input.callbacks?.onTextDelta?.(finalText);

  clearHermesExecutionContext(requestId);

  return {
    success: true,
    message: finalText,
    runId: requestId,
    toolCalls: [...toolCalls.values()],
    ...(verifiedSearch ? { data: verifiedSearch } : {}),
  };
}
