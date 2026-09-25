import type OpenAI from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { detectAbnormalScript } from "@/lib/olivia/output/scriptSanitizer";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import type { OliviaStreamEvent, OliviaToolCall } from "@/lib/olivia/v2/types";

// PHASE 4 작업 5(2026-09-25) — app/api/olivia/v2/stream/route.ts에서 그대로 옮겼다. 동작 변경 없음.
// legacy(OpenAI Responses) 경로의 한 라운드 실행 + 이상 문자 검사·재생성·fallback 대체까지
// 이 파일이 "스크립트 검증·폴백"을 전담한다(작업 지시서 표의 scriptGuard.ts).

export type StreamingRequest = Omit<ResponseCreateParamsStreaming, "model" | "stream">;

export async function streamOpenAIResponse(input: {
  openai: OpenAI;
  model: string;
  request: StreamingRequest;
  signal: AbortSignal;
  onFirstToken?: () => void;
}): Promise<{ text: string; toolCalls: OliviaToolCall[]; responseId: string }> {
  const stream = await input.openai.responses.create(
    { ...input.request, model: input.model, stream: true },
    { signal: input.signal },
  );
  const toolCalls: OliviaToolCall[] = [];
  let text = "";
  let responseId = "";

  for await (const event of stream) {
    const current = event as ResponseStreamEvent;
    if (current.type === "response.created") {
      responseId = current.response.id;
    } else if (current.type === "response.output_text.delta") {
      // 이상 문자(아랍어/히브리어/키릴 등) 검사를 라운드 텍스트가 완성된 뒤 한 번에 하기 위해
      // 여기서는 클라이언트로 바로 흘려보내지 않고 누적만 한다 — 실제 전송은 아래 라운드 루프의
      // flushTextAsDeltas()가 검사를 통과한 뒤에 synthetic delta로 대신한다.
      input.onFirstToken?.();
      text += current.delta;
    } else if (current.type === "response.output_item.done" && current.item.type === "function_call") {
      toolCalls.push({
        id: current.item.call_id,
        name: current.item.name,
        arguments: current.item.arguments || "{}",
      });
    } else if (current.type === "response.completed") {
      responseId = current.response.id;
    } else if (current.type === "response.failed") {
      throw new Error(current.response.error?.message || "OpenAI 응답 생성에 실패했습니다.");
    }
  }

  return { text, toolCalls, responseId };
}

// 검증이 끝난(또는 애초에 실시간으로 흘릴 필요가 없는) 텍스트를 한 번에 내보낸다. 예전엔 6자씩
// 12ms 간격(초당 500자)으로 가짜 타이핑을 재생했는데, 이미 검증까지 끝난 텍스트를 인위적으로
// 느리게 보낼 이유가 없다(코드 요청서 2026-09-18 작업 A §2) — 제거했다. 이상 문자 검사 자체는
// 이 함수가 하는 일이 아니다(호출부가 검증을 마친 텍스트만 여기로 넘긴다).
export async function flushTextAsDeltas(text: string, send: (event: OliviaStreamEvent) => void, messageId: string) {
  if (!text) return;
  send({ type: "text_delta", messageId, delta: text });
}

// 한 라운드의 응답 텍스트에 이상 문자가 섞여 있으면 클라이언트에 절대 보여주지 않는다 — 같은
// 요청을 1회만 재생성해보고, 그래도 안 되면 안전한 fallback 문구로 대체한다(재시도 반복은
// 비용/지연 때문에 하지 않는다). 원문은 서버 로그에만 남긴다.
export async function runRoundWithSanitization(
  params: Parameters<typeof streamOpenAIResponse>[0],
): Promise<{ text: string; toolCalls: OliviaToolCall[]; responseId: string }> {
  let response = await streamOpenAIResponse(params);
  if (response.text && !detectAbnormalScript(response.text).clean) {
    const anomaly = detectAbnormalScript(response.text);
    console.error("[olivia-v2] abnormal script detected, regenerating once", { offendingRanges: anomaly.offendingRanges, raw: response.text });
    response = await streamOpenAIResponse(params);
    if (response.text && !detectAbnormalScript(response.text).clean) {
      console.error("[olivia-v2] abnormal script persisted after retry, using fallback", { raw: response.text });
      response = { ...response, text: OLIVIA_FALLBACK_MESSAGES.sanitizationFallback };
    }
  }
  return response;
}
