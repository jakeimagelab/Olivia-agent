import { NextRequest } from "next/server";
import OpenAI from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseInputItem,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import {
  getOrCreateAssistantConversation,
  listAssistantMessages,
  saveAssistantMessage,
} from "@/lib/assistant/conversations/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeAgentTool, OLIVIA_V2_TOOLS } from "@/lib/olivia/v2/toolExecutor";
import { classifyOliviaRequest, routeOliviaModel } from "@/lib/olivia/v2/modelRouter";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { OliviaContextSnapshot, OliviaStreamEvent, OliviaToolCall } from "@/lib/olivia/v2/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 도구가 20여 개(견적/콘티) → 45개 이상(캘린더/워크플로우/메일링/갤러리/이메일/브리핑/미팅/진단 추가)으로
// 늘면서 "이번달 일정 보여주고 계약 안 된 곳 견적 다시 보내줘" 같은 복합 요청이 한 라운드로 안 끝날
// 수 있어 4 → 6으로 올렸다.
const MAX_TOOL_ROUNDS = 6;

// 레거시(Claude) 경로(lib/assistant/core/legacyOliviaCore.ts:752)는 시스템 프롬프트에 오늘 날짜를
// 직접 박아 넣는데, v2(OpenAI) 경로는 이 프롬프트가 빠져 있어서 모델이 학습 데이터의 연도를 그대로
// 추측해 답했다("지금이 2025년" 등, 2026-08-14 사용자 리포트로 발견) — 매 요청마다 새로 계산해서
// 콜드/웜 스타트 시점에 관계없이 항상 실제 오늘 날짜를 쓰게 한다.
function buildSystemPrompt(): string {
  const today = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long",
  });
  return `당신은 포토클리닉 운영 AI Agent Olivia다. 사용자는 대표자다.

오늘 날짜: ${today} (한국 시간 기준 — 절대 학습 데이터의 연도로 추측하지 말고 이 날짜를 기준으로 답한다. '오늘'/'내일'/'이번주 금요일' 등을 YYYY-MM-DD로 변환할 때도 이 날짜를 쓴다.)

<operating_rules>
- 현재 Context를 먼저 사용한다. 이미 선택된 고객/프로젝트를 다시 묻지 않는다.
- Workspace가 열려 있으면 해당 Resource를 우선 대상으로 본다.
- 선택 항목이 명확하면 “이거”, “그거”, “50으로”의 우선 참조 대상으로 본다.
- 후보가 둘 이상이면 추측하거나 수정하지 말고 한 문장으로 확인한다.
- 어떤 도구를 쓸지, 어떤 값을 넣을지 애매하면 절대 추측해서 진행하지 않는다. 짧게 되물어서 확인한 뒤에만 실행한다.
- 특정 고객명 없이 "지금 뭐 진행 중이야" 같은 전체 조회는 list_active_workflows, 한 고객의 현황은 get_workflow_status를 쓴다. 하루 일정은 calendar_list, 여러 날/이번달은 calendar_list_month를 쓴다(하루씩 여러 번 부르지 않는다).
- 견적 항목은 선택 항목을 우선하고, 없으면 이름이 하나로 식별될 때만 수정한다. 첫 항목을 임의 선택하지 않는다.
- 금액·수량·컷 번호는 사용자의 한국어 표현을 그대로 tool argument로 전달해도 된다.
- 총액 맞추기, 견적 공개, 콘티 컷 삭제는 승인 도구를 호출하며 승인 전 완료했다고 말하지 않는다.
- 단가가 없는 새 견적 항목의 금액을 임의 생성하지 않는다.
- 단순 수정 결과는 변경 항목과 새 총액만 짧게 말한다.
- 명확한 업무 요청은 제공된 도구로 처리한다. 견적/계약/콘티뿐 아니라 캘린더, 이메일(Gmail), 워크플로우 단계 이동, 메일링 큐, 사진 갤러리, 오늘 브리핑/긴급 인사이트, 고객·프로젝트 검색, 미팅 준비/분석/후속조치, 상담 메모 저장도 각 도구로 직접 처리한다. 애매하면 추측하지 말고 되묻는다.
- "현재 단계 처리해줘"/"체크리스트 뭐 남았어" 같은 요청은 advance_workflow_step(특정 단계로 강제 이동)이 아니라 process_workflow_step(대기 업무 실행)/list_workflow_step_tasks(체크리스트 조회)를 쓴다. 체크리스트 항목 하나만 콕 집어 승인/처리해달라고 하면 approve_workflow_task를 쓴다. 이 세 도구가 "이 단계는 실제 문서가 있어야 넘어갈 수 있다"고 답하면 절대 advance_workflow_step으로 우회해서 억지로 넘기지 않는다 — 안내한 대로 견적서/계약서/콘티부터 만들라고 전달한다.
- "OO 실행해줘"/"OO 열어줘"/"OO 보여줘"처럼 특정 화면·기능을 열려는 요청은(그 기능이 위 목록의 전용 도구로 처리되는 게 아니라면) 무조건 open_feature를 먼저 호출한다. 절대 "그 기능은 지원하지 않는다"거나 "할 수 없다"고 스스로 판단해서 설명만 하고 끝내지 않는다 — 실제로 있는지 없는지는 open_feature 결과가 알려준다.
  - matched:true면 화면이 열렸다는 뜻이니 "OO 열었어요" 정도로 짧게 답한다.
  - ambiguous:true면 candidates 목록을 그대로 사용자에게 보여주며 어느 걸 열지 되묻는다(임의로 하나를 골라 열지 않는다).
  - 도구가 실패(success:false)하면 그건 "존재하지 않는 기능"이라는 뜻이다 — "그런 기능은 없는 것 같아요"라고 답하되, 존재는 하는데 실행 중 오류가 난 다른 도구 실패와는 구분해서 말한다(예: 도구 자체 오류는 "여는 중 문제가 생겼어요. 다시 시도해볼게요"처럼 오류로 표현하고, open_feature가 "찾지 못했다"고 한 경우에만 없는 기능으로 표현한다).
- 도구 성공 결과를 받은 뒤에만 완료했다고 말한다.
- DB 생성/수정 결과에 포함된 실제 ID만 사용한다.
- 고객 공개, 계약 확정, 중요 데이터 삭제, 외부 발송은 확인 없이 실행하지 않는다.
- 내부 reasoning은 노출하지 않고 사용자에게 필요한 진행 상태만 짧게 알린다.
- 한국어로 간결하고 자연스럽게 답한다.
</operating_rules>`;

type ConversationMessage = Awaited<ReturnType<typeof listAssistantMessages>>[number];
type StreamingRequest = Omit<ResponseCreateParamsStreaming, "model" | "stream">;

function encodeEvent(event: OliviaStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function normalizeContext(value: unknown): OliviaContextSnapshot {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const actions = Array.isArray(input.recentActions)
    ? input.recentActions.flatMap((action) => {
        if (!action || typeof action !== "object" || Array.isArray(action)) return [];
        const row = action as Record<string, unknown>;
        const type = optionalString(row.type);
        return type ? [{ type, at: optionalString(row.at) || new Date(0).toISOString(), entityId: optionalString(row.entityId) }] : [];
      }).slice(-8)
    : [];
  return {
    pathname: optionalString(input.pathname),
    activeClientId: optionalString(input.activeClientId),
    activeClientName: optionalString(input.activeClientName),
    activeProjectId: optionalString(input.activeProjectId),
    activeProjectName: optionalString(input.activeProjectName),
    activeWorkspace: optionalString(input.activeWorkspace),
    activeResourceId: optionalString(input.activeResourceId),
    selectedEntityType: optionalString(input.selectedEntityType),
    selectedEntityId: optionalString(input.selectedEntityId),
    selectedScheduleId: optionalString(input.selectedScheduleId),
    recentActions: actions,
    revision: typeof input.revision === "number" ? input.revision : 0,
  };
}

function contextPrompt(context: OliviaContextSnapshot, pageContext?: string) {
  const lines = [
    context.pathname ? `현재 경로: ${context.pathname}` : null,
    context.activeClientName || context.activeClientId
      ? `현재 고객: ${context.activeClientName || "이름 없음"} (${context.activeClientId || "ID 없음"})`
      : null,
    context.activeProjectName || context.activeProjectId
      ? `현재 프로젝트: ${context.activeProjectName || "이름 없음"} (${context.activeProjectId || "ID 없음"})`
      : null,
    context.activeWorkspace ? `현재 Workspace: ${context.activeWorkspace}` : null,
    context.activeResourceId ? `현재 Resource ID: ${context.activeResourceId}` : null,
    context.selectedEntityId || context.selectedEntityType
      ? `현재 선택 항목: ${context.selectedEntityType || "유형 없음"} ${context.selectedEntityId || "ID 없음"}`
      : null,
    context.selectedScheduleId ? `현재 선택 일정: ${context.selectedScheduleId}` : null,
    context.recentActions.length
      ? `최근 UI Action: ${context.recentActions.slice(-4).map((action) => action.type).join(" → ")}`
      : null,
  ].filter((line): line is string => Boolean(line));
  if (pageContext) lines.unshift(`클라이언트 Page Context: ${pageContext}`);
  return lines.length ? lines.join("\n") : "선택된 고객, 프로젝트, Workspace가 없습니다.";
}

function toInputMessages(
  rows: ConversationMessage[],
  message: string,
  context: OliviaContextSnapshot,
  pageContext?: string,
): ResponseInputItem[] {
  const history: ResponseInputItem[] = rows.slice(-30).map((row) => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content || ""),
  }));
  return [
    ...history,
    {
      role: "user",
      content: `[Dynamic Context]\n${contextPrompt(context, pageContext)}\n\n[User Request]\n${message}`,
    },
  ];
}

function updateWorkingContext(context: OliviaContextSnapshot, action: OliviaUiAction): OliviaContextSnapshot {
  if (action.type === "UPDATE_CONTEXT") {
    return {
      ...context,
      activeClientId: action.clientId ?? context.activeClientId,
      activeClientName: action.clientName ?? context.activeClientName,
      activeProjectId: action.projectId ?? context.activeProjectId,
      activeProjectName: action.projectName ?? context.activeProjectName,
      revision: context.revision + 1,
    };
  }
  if (action.type === "OPEN_WORKSPACE") {
    return {
      ...context,
      activeClientId: action.clientId ?? context.activeClientId,
      activeClientName: action.clientName ?? context.activeClientName,
      activeProjectId: action.workflowRunId ?? context.activeProjectId,
      activeProjectName: action.projectName ?? context.activeProjectName,
      activeWorkspace: action.workspace,
      activeResourceId: action.resourceId,
      selectedEntityId: undefined,
      selectedEntityType: undefined,
      revision: context.revision + 1,
    };
  }
  if (action.type === "SWITCH_WORKSPACE") {
    return {
      ...context,
      activeWorkspace: action.workspace,
      activeResourceId: action.resourceId,
      selectedEntityId: undefined,
      selectedEntityType: undefined,
      revision: context.revision + 1,
    };
  }
  if (action.type === "REFRESH_RESOURCE") {
    return { ...context, activeResourceId: action.resourceId, revision: context.revision + 1 };
  }
  return context;
}

async function streamOpenAIResponse(input: {
  openai: OpenAI;
  model: string;
  request: StreamingRequest;
  signal: AbortSignal;
  send: (event: OliviaStreamEvent) => void;
  messageId: string;
}) {
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
      text += current.delta;
      input.send({ type: "text_delta", messageId: input.messageId, delta: current.delta });
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

function toolStatus(name: string) {
  if (name === "select_project") return "고객과 프로젝트를 확인하는 중…";
  if (name === "create_quote") return "견적 초안을 생성하는 중…";
  if (name === "create_contract") return "계약서 초안을 생성하는 중…";
  if (name === "create_conti") return "콘티 초안을 생성하는 중…";
  if (name === "update_quote_item") return "견적을 수정하는 중…";
  if (["add_quote_item", "remove_quote_item", "update_quote_note", "apply_quote_discount", "update_quote_vat_mode"].includes(name)) return "견적을 수정하는 중…";
  if (name === "rebalance_quote_total") return "견적 조정안을 계산하는 중…";
  if (name === "add_conti_shots") return "콘티 컷을 구성하는 중…";
  if (["update_conti_shot", "remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot"].includes(name)) return "콘티를 수정하는 중…";
  if (name === "open_feature") return "화면을 찾는 중…";
  if (name === "list_workflow_step_tasks") return "업무 프로세스를 확인하는 중…";
  if (name === "process_workflow_step") return "현재 단계 업무를 처리하는 중…";
  if (name === "approve_workflow_task") return "업무를 처리하는 중…";
  return "화면을 준비하는 중…";
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json() as Record<string, unknown>;
  const message = String(body.message || "").trim();
  if (!message) return Response.json({ ok: false, error: "메시지를 입력해주세요." }, { status: 400 });

  const context = normalizeContext(body.context);
  const pageContext = optionalString(body.pageContext);
  const requestClass = classifyOliviaRequest(message, context);
  const model = routeOliviaModel(requestClass);
  if (!process.env.OPENAI_API_KEY || !model) {
    return Response.json({ ok: false, error: "Olivia GPT 환경변수 설정을 확인해주세요." }, { status: 503 });
  }

  console.info("[olivia-v2] request", {
    model,
    requestClass,
    clientId: context.activeClientId,
    projectId: context.activeProjectId,
    workspace: context.activeWorkspace,
    resourceId: context.activeResourceId,
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: OliviaStreamEvent) => {
        if (!closed) controller.enqueue(encoder.encode(encodeEvent(event)));
      };
      const messageId = optionalString(body.responseId) || crypto.randomUUID();

      try {
        const db = getSupabaseAdmin();
        const owner = await ensurePrimaryAssistantOwner(db);
        let conversation = await getOrCreateAssistantConversation(db, owner.id);
        const requestedConversationId = optionalString(body.conversationId);
        if (requestedConversationId) {
          const { data: requestedConversation } = await db.from("assistant_conversations")
            .select("id,owner_id")
            .eq("id", requestedConversationId)
            .eq("owner_id", owner.id)
            .maybeSingle();
          if (requestedConversation) conversation = requestedConversation as { id: string; owner_id: string };
        }

        const history = await listAssistantMessages(db, owner.id, conversation.id, 50);
        await saveAssistantMessage(db, {
          ownerId: owner.id,
          conversationId: conversation.id,
          role: "user",
          content: message,
          channel: "web",
          externalMessageId: optionalString(body.clientRequestId) || crypto.randomUUID(),
          metadata: { context, pageContext, requestClass },
        });

        send({ type: "message_start", messageId, conversationId: conversation.id });
        send({ type: "agent_status", status: "요청을 이해하는 중…" });

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        let request: StreamingRequest = {
          instructions: SYSTEM_PROMPT,
          input: toInputMessages(history, message, context, pageContext),
          tools: OLIVIA_V2_TOOLS,
          parallel_tool_calls: false,
        };
        let workingContext = context;
        let finalText = "";

        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const response = await streamOpenAIResponse({
            openai,
            model,
            request,
            signal: req.signal,
            send,
            messageId,
          });
          finalText += response.text;
          if (!response.toolCalls.length) break;
          if (!response.responseId) throw new Error("OpenAI tool response ID가 없습니다.");

          const outputs: ResponseInputItem[] = [];
          for (const toolCall of response.toolCalls) {
            send({ type: "agent_status", status: toolStatus(toolCall.name) });
            send({ type: "tool_start", tool: toolCall.name, toolCallId: toolCall.id });
            console.info("[olivia-v2] tool requested", { tool: toolCall.name, round });

            const execution = await executeAgentTool(toolCall, workingContext);
            const toolPayload = execution.result.success
              ? execution.result.data || {}
              : { message: execution.result.error || "작업을 완료하지 못했어요." };
            send({
              type: "tool_result",
              tool: toolCall.name,
              toolCallId: toolCall.id,
              success: execution.result.success,
              result: toolPayload,
            });
            console.info("[olivia-v2] tool result", { tool: toolCall.name, success: execution.result.success });

            // DB 작업과 tool_result가 완료된 뒤에만 UI Action을 전송한다.
            for (const action of execution.uiActions) {
              send({ type: "ui_action", action });
              workingContext = updateWorkingContext(workingContext, action);
              console.info("[olivia-v2] ui action", { type: action.type });
            }

            outputs.push({
              type: "function_call_output",
              call_id: toolCall.id,
              output: JSON.stringify({ success: execution.result.success, ...toolPayload }),
            });
          }

          send({ type: "agent_status", status: "결과를 정리하는 중…" });
          request = {
            previous_response_id: response.responseId,
            input: outputs,
            tools: OLIVIA_V2_TOOLS,
            parallel_tool_calls: false,
          };
        }

        if (!finalText.trim()) finalText = "요청한 작업을 확인했어요.";
        await saveAssistantMessage(db, {
          ownerId: owner.id,
          conversationId: conversation.id,
          role: "assistant",
          content: finalText,
          channel: "web",
          parentMessageId: undefined,
          metadata: { blocks: [{ type: "text", text: finalText }], model, requestClass },
        });
        send({ type: "message_complete", messageId, conversationId: conversation.id });
      } catch (error) {
        if (req.signal.aborted) {
          console.info("[olivia-v2] response cancelled");
        } else {
          console.error("[olivia-v2] stream failed", error);
          send({
            type: "error",
            message: "Olivia 응답을 불러오지 못했어요. 다시 시도해주세요.",
            retryable: true,
          });
        }
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
