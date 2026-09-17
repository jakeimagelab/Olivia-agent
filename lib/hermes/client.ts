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
const HERMES_HEALTH_TIMEOUT_MS = 5_000;

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

// Secure Tunnel 전환(Olivia↔Hermes network topology 개편) — HERMES_API_SECRET을 새 표준
// 이름으로 쓰되, 기존 PoC부터 쓰던 HERMES_API_KEY도 그대로 인식한다(둘 다 있으면 SECRET 우선).
// 이름을 강제로 바꾸면 이미 HERMES_API_KEY로 설정된 운영 환경이 조용히 깨진다.
function getHermesConfig() {
  const baseUrl = process.env.HERMES_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.HERMES_API_SECRET?.trim() || process.env.HERMES_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new HermesChatError("Hermes Agent 환경변수 설정을 확인해주세요.", true);
  if (/^(https?:\/\/)?100\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/.test(baseUrl)) {
    // Tailscale 대역(CGNAT 100.64.0.0/10)은 Vercel 서버리스에서 원천적으로 도달 불가능하다 —
    // 여기서 막지 않으면 매 요청이 타임아웃까지 기다린 뒤에야 실패한다(네트워크 토폴로지 개편의
    // 이유 그 자체). Secure Tunnel(Cloudflare Tunnel 등)의 공개 HTTPS 주소로 바꿔야 한다.
    console.warn("[HERMES CONFIG] HERMES_BASE_URL이 Tailscale private IP(100.x.x.x)입니다 — Vercel에서 도달할 수 없습니다. Secure Tunnel의 공개 URL로 바꿔주세요.");
  }
  return { baseUrl, apiKey, model: process.env.HERMES_MODEL?.trim() || "hermes-agent" };
}

type HermesErrorLogInput = {
  requestId: string;
  errorType: "fetch_failed" | "timeout" | "http_error" | "stream_error";
  httpStatus?: number;
  startedAt: number;
};

// 토큰/secret은 절대 남기지 않는다(스펙 §4) — requestId/errorType/httpStatus/elapsedMs만.
function logHermesError({ requestId, errorType, httpStatus, startedAt }: HermesErrorLogInput): void {
  console.warn("[HERMES ERROR]", {
    requestId,
    errorType,
    httpStatus: httpStatus ?? null,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
}

// 문서/파일/일정 등 다른 검색 대상이 함께 언급되면 "찾아/검색/조회"가 있어도 고객 검색이 아니다
// — "사진 찾아줘"/"파일 검색해줘"/"견적서 찾아줘"까지 고객검색으로 오판하면 client.search Tool을
// 강제하다가(§아래 guardedResponse) 정상적인 문서 검색 요청을 에러로 막아버린다.
const NON_CLIENT_SEARCH_TOPIC = /(사진|이미지|파일|폴더|문서|견적|계약|콘티|스토리보드|메모|일정|캘린더|메일|이메일|워크플로|갤러리|셀렉|영상|동영상)/i;

export function isClientSearchRequest(message: string) {
  if (NON_CLIENT_SEARCH_TOPIC.test(message)) return false;
  return /(찾아|검색|조회|등록.*(?:고객|병원|의원|클리닉)|(?:고객|병원|의원|클리닉).*있[어는나]?)/i.test(message);
}

export function isMutationIntent(message: string) {
  return /(추가|등록|생성|만들|수정|변경|삭제|저장|메모|완료|확정|발행|공개|넣어|남겨)/i.test(message)
    || /^\s*(응|네|예|그래|좋아|진행해|확인|승인)(?:\s*[.!])?\s*$/i.test(message);
}

export function claimsMutationCompletion(message: string) {
  return /(추가|등록|생성|만들|수정|변경|삭제|저장|완료|확정|발행|공개)(?:했|됐|되었습니다|했습니다|했어요|됐어요)/i.test(message);
}

// Olivia OS 2.0 — Hermes Chat Intelligence Upgrade §6. "열어"/"바꿔줘"류 UI 실행 요청 감지.
// mutation 표현과 겹치지 않는 별도 집합이다 — UI 전환은 DB에 아무것도 쓰지 않으므로
// claimsMutationCompletion()/mutationAudits로는 검증되지 않는다(§7 "NO UI ACTION = NO SUCCESS CLAIM").
export function isUiExecutionIntent(message: string) {
  return /(열어줘|열어|보여줘|띄워줘|바꿔줘|바꿔|전환해|이동해|가\s*줘|거기로\s*가|다시\s*열어|그걸로\s*바꿔)/i.test(message);
}

const DOCUMENT_NAME_PRONOUNS = new Set(["그거", "그것", "이거", "이것", "저거", "저것", "그", "이", "저", "방금", "아까", "다시"]);

// Olivia OS 채팅/견적서 수정 로직 개선 §10(TEST 6) — "OO 견적서 열어줘"에서 고객명 추정.
// "그거 견적서 열어줘"처럼 지시대명사만 있으면 비교 대상이 없다는 뜻이라 null을 반환한다
// (검색/직전 context로 이미 정확한 대상이 골라졌을 가능성이 높아 오탐을 만들면 안 된다).
export function extractRequestedDocumentName(message: string): string | null {
  const match = message.match(/([가-힣A-Za-z0-9()·・&+\-\s]{1,40}?)\s*(?:견적서|견적|계약서|계약)/);
  const raw = match?.[1]?.trim();
  if (!raw || raw.length < 2 || DOCUMENT_NAME_PRONOUNS.has(raw)) return null;
  return raw;
}

function normalizeForNameCompare(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

// "열었어요"/"바꿨어요"류 완료 주장 — mutation 완료 문구(claimsMutationCompletion)와는 다른
// 집합이라 별도로 감지한다. Hermes가 open_document/show_workspace류 Tool을 실제로 호출하지
// 않고도(=uiActions가 비어있는데도) 이렇게 말하면 §7 위반이다.
export function claimsUiExecutionCompletion(message: string) {
  return /(열었|열어\s*드렸|보여\s*드렸|보여드렸|보여줬|띄웠|바꿨|바꾸었|바뀌었|전환했|전환됐|이동했)(?:습니다|어요|네요|다)?/i.test(message);
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
  const startedAt = performance.now();
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
    const timedOut = controller.signal.aborted && !input.signal?.aborted;
    logHermesError({ requestId, errorType: timedOut ? "timeout" : "fetch_failed", startedAt });
    if (timedOut) throw new HermesChatError("Hermes Agent 응답 시간이 초과되었습니다.", true);
    throw new HermesChatError("Hermes Agent에 연결할 수 없습니다. Mac Studio Hermes Server 상태를 확인해주세요.", true);
  }

  if (!response.ok || !response.body) {
    clearHermesExecutionContext(requestId);
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
    logHermesError({ requestId, errorType: "http_error", httpStatus: response.status, startedAt });
    throw new HermesChatError(response.status === 401
      ? "Hermes Agent 인증 설정을 확인해주세요."
      : "Hermes Agent에 연결할 수 없습니다. Mac Studio Hermes Server 상태를 확인해주세요.", true);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<string, HermesToolCallRecord>();
  const searchRequest = isClientSearchRequest(input.message);
  const mutationRequest = isMutationIntent(input.message);
  const uiExecutionRequest = isUiExecutionIntent(input.message);
  const guardedResponse = searchRequest || mutationRequest || uiExecutionRequest;
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
    const timedOut = controller.signal.aborted && !input.signal?.aborted;
    logHermesError({ requestId, errorType: timedOut ? "timeout" : "stream_error", startedAt });
    if (timedOut) throw new HermesChatError("Hermes Agent 응답 시간이 초과되었습니다.", false);
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

  // §7 "NO UI ACTION = NO SUCCESS CLAIM" — "열었어요"/"바꿨어요" 같은 화면 전환 완료 주장은
  // 실제로 성공한 Tool 중 하나라도 uiActions를 만들어냈을 때만 허용한다. open_document/
  // show_workspace처럼 화면을 바꾸는 Tool은 MCP 실행 시점에 이미 uiActions가 채워져 있으므로
  // (executeAgentTool → resolveUiActions, lib/hermes/mcp/oliviaToolBridge.ts) 이 시점에 grounding이
  // 가능하다. mutation 완료 문구와 겹치지 않게 claimsUiExecutionCompletion()은 별도 표현만 본다.
  const dispatchedUiActionCount = [...toolCalls.values()]
    .filter((call) => call.success)
    .reduce((sum, call) => sum + (call.uiActions?.length ?? 0), 0);
  if (uiExecutionRequest && dispatchedUiActionCount === 0 && claimsUiExecutionCompletion(finalText)) {
    finalText = "아직 화면을 실제로 바꾸지는 못했어요. 다시 열어볼게요.";
  }

  // §10(TEST 6) "실제 열린 고객이 다르면 절대로 성공 응답 금지" — uiActions는 실제로 났지만
  // (위 가드는 통과) 열린 문서의 hospitalName이 사용자가 부른 이름과 명확히 다르면 완료
  // 주장을 취소한다. 지시대명사만 쓴 경우(requestedDocumentName null)는 비교하지 않는다 —
  // 검색/직전 context로 고른 결과를 오탐으로 걷어차면 안 된다.
  const requestedDocumentName = extractRequestedDocumentName(input.message);
  if (requestedDocumentName && claimsUiExecutionCompletion(finalText)) {
    const normalizedRequested = normalizeForNameCompare(requestedDocumentName);
    const mismatchedOpen = [...toolCalls.values()].some((call) => {
      if (!call.success || !call.uiActions?.length) return false;
      const hospitalName = call.data && typeof call.data === "object" && !Array.isArray(call.data)
        ? (call.data as Record<string, unknown>).hospitalName
        : undefined;
      if (typeof hospitalName !== "string" || !hospitalName.trim()) return false;
      const normalizedActual = normalizeForNameCompare(hospitalName);
      return !normalizedActual.includes(normalizedRequested) && !normalizedRequested.includes(normalizedActual);
    });
    if (mismatchedOpen) finalText = "요청하신 고객과 다른 문서가 열린 것 같아요. 고객명을 다시 확인해주세요.";
  }

  if (verifiedSearch?.clients.length === 0) {
    finalText = "등록된 고객에서 찾지 못했습니다.";
  } else if (verifiedSearch && verifiedSearch.clients.length > 1) {
    finalText = `등록 고객 후보가 ${verifiedSearch.clients.length}곳 있습니다.\n${verifiedSearch.clients
      .map((client, index) => `${index + 1}. ${client.name}${client.specialty ? ` · ${client.specialty}` : ""}`)
      .join("\n")}`;
  } else if (verifiedSearch?.clients.length === 1) {
    // §11 "검색 결과가 최종 답변을 덮어쓰는 구조 수정" — Tool audit은 사실 검증 용도지, Hermes가
    // 이미 옳게 답했다면(예: "찾았고 최근 견적서도 열었어요") 이름이 문자 그대로 없다는 이유만으로
    // 통째로 덮어쓰지 않는다. 실제 검색 결과와 모순되는 부정 답변이거나 빈 텍스트일 때만 보정한다.
    const contradictsFoundResult = !finalText.trim()
      || finalText === "응답을 생성하지 못했습니다."
      || /(찾지\s*못|없습니다|없어요|모르겠)/.test(finalText);
    if (contradictsFoundResult) finalText = `${verifiedSearch.clients[0].name} 고객을 찾았습니다.`;
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
