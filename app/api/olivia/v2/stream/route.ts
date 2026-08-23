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
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import { classifyOliviaRequest, routeOliviaModel } from "@/lib/olivia/v2/modelRouter";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { OliviaContextSnapshot, OliviaStreamEvent, OliviaToolCall } from "@/lib/olivia/v2/types";
import { buildOliviaRuntimeContext } from "@/lib/olivia/runtime/buildRuntimeContext";
import type { OliviaRuntimeContext } from "@/lib/olivia/runtime/types";
import { resolveTemporalExpression } from "@/lib/olivia/runtime/temporalResolver";
import { resolveDeterministicResponse } from "@/lib/olivia/orchestrator/handleRequest";
import { classifyRequestKind } from "@/lib/olivia/orchestrator/classifyRequest";
import { applyAliasRewrite } from "@/lib/olivia/intelligence/aliasResolver";
import { applyReferentRewrite } from "@/lib/olivia/intelligence/referentResolver";
import { selectOliviaTools } from "@/lib/olivia/v2/toolSelection";
import { executeOliviaToolBatch } from "@/lib/olivia/v2/toolScheduler";
import { inferPersistentRunClientName, inferPersistentRunType, shouldCreatePersistentAgentRun } from "@/lib/olivia/v2/persistentRunClassifier";
import { createAgentRun } from "@/lib/olivia/agentRuns/service";
import { hasDatabaseFastPath, resolveDatabaseFastPath } from "@/lib/olivia/v2/databaseFastPath";
import { detectAbnormalScript, isWellFormedHistoryText } from "@/lib/olivia/output/scriptSanitizer";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 도구가 20여 개(견적/콘티) → 45개 이상(캘린더/워크플로우/메일링/갤러리/이메일/브리핑/미팅/진단 추가)으로
// 늘면서 "이번달 일정 보여주고 계약 안 된 곳 견적 다시 보내줘" 같은 복합 요청이 한 라운드로 안 끝날
// 수 있어 4 → 6 → 12로 올렸다(2026-08-15, 코드 요청서 1번 항목 — 무한 루프 세이프가드는 그대로 유지).
function maxToolRounds(requestClass: ReturnType<typeof classifyOliviaRequest>) {
  if (requestClass === "FAST_COMMAND") return 2;
  if (requestClass === "NORMAL_CHAT") return 3;
  if (requestClass === "TOOL_ACTION") return 5;
  return 6;
}

// 레거시(Claude) 경로(lib/assistant/core/legacyOliviaCore.ts:752)는 시스템 프롬프트에 오늘 날짜를
// 직접 박아 넣는데, v2(OpenAI) 경로는 이 프롬프트가 빠져 있어서 모델이 학습 데이터의 연도를 그대로
// 추측해 답했다("지금이 2025년" 등, 2026-08-14 사용자 리포트로 발견) — 매 요청마다 새로 계산해서
// 콜드/웜 스타트 시점에 관계없이 항상 실제 오늘 날짜를 쓰게 한다.
// 진짜 source of truth는 lib/olivia/runtime/buildRuntimeContext.ts가 계산한 OliviaRuntimeContext다
// — 이 프롬프트의 "오늘 날짜" 문구는 그 값을 GPT에게 설명해주는 보조 수단일 뿐이다(런타임 질문
// 자체는 GPT를 거치지 않고 orchestrator가 직접 답한다. 아래 handleRequest 참고).
function buildSystemPrompt(runtime: OliviaRuntimeContext, olderSummary?: string): string {
  return `당신은 포토클리닉 운영 AI Agent Olivia다. 사용자는 대표자다.

오늘 날짜: ${runtime.todayISO} ${runtime.weekdayKo} (한국 시간 기준 — 절대 학습 데이터의 연도로 추측하지 말고 이 날짜를 기준으로 답한다. '오늘'/'내일'/'이번주 금요일' 등을 YYYY-MM-DD로 변환할 때도 이 날짜를 쓴다.)
${olderSummary ? `\n<이전_대화_요약>\n대화가 길어져 아래는 더 오래된 assistant 응답 원문 일부다(요약이 아니라 실제 발화를 짧게 자른 것 — 지어낸 내용 없음). 최근 대화와 이어지지 않는 부분이 있으면 사용자에게 확인한다.\n${olderSummary}\n</이전_대화_요약>\n` : ""}

<operating_rules>
- 현재 Context를 먼저 사용한다. 이미 선택된 고객/프로젝트를 다시 묻지 않는다.
- Workspace가 열려 있으면 해당 Resource를 우선 대상으로 본다.
- 선택 항목이 명확하면 “이거”, “그거”, “50으로”의 우선 참조 대상으로 본다.
- "최근 언급된 대상"/"등록된 별칭"이 Context에 있으면 그걸로 짧은 표현을 해석해서 도구의 clientName 등에 정식 명칭을 채운다. "정확한 고객명을 입력해주세요" 같은 요구를 하지 않는다 — 후보가 진짜 여럿이거나 아예 단서가 없을 때만 되묻는다.
- 후보가 둘 이상이면 추측하거나 수정하지 말고 한 문장으로 확인한다.
- 어떤 도구를 쓸지, 어떤 값을 넣을지 애매하면 절대 추측해서 진행하지 않는다. 짧게 되물어서 확인한 뒤에만 실행한다.
- 특정 고객명 없이 "지금 뭐 진행 중이야" 같은 전체 조회는 list_active_workflows, 한 고객의 현황은 get_workflow_status를 쓴다. 하루 일정은 calendar_list, 여러 날/이번달은 calendar_list_month를 쓴다(하루씩 여러 번 부르지 않는다).
- create_quote/create_conti/create_contract는 hospitalName만 실제로 필요하다 — packageId·담당자명·연락처·이메일·촬영일·프로필/연출 컷 수·메모 같은 나머지 값은 모두 선택 항목이라 비워도(null) 도구가 정상적으로 문서를 만든다. 정보가 부족하다고 "시스템상 필수라 생성이 안 된다"처럼 제한이 있는 것처럼 답하지 않는다 — 알고 있는 값만 채워 그대로 만들거나, 필요하면 "담당자 정보 없이 진행해도 될까요?"처럼 자연스럽게 한 번만 확인하고 동의하면 바로 만든다.
- 견적 항목은 선택 항목을 우선하고, 없으면 이름이 하나로 식별될 때만 수정한다. 첫 항목을 임의 선택하지 않는다.
- 금액·수량·컷 번호는 사용자의 한국어 표현을 그대로 tool argument로 전달해도 된다.
- 캘린더 일정의 분류 색상은 촬영=shooting, 고객=client, 행정=admin, 개인=personal, 기타=general 다섯 가지뿐이다. "OO 일정 개인으로 바꿔줘"/"저 색으로"처럼 이 이름을 말하면 calendar_update의 category만 그 값으로 채워 바로 실행한다 — 어떤 색인지 되묻지 않는다.
- "두 번째 항목"/"마지막 컷"/"맨 아래"/"첫 번째"처럼 순서를 가리키는 표현은 직접 인덱스를 계산하지 말고, 사용자가 말한 표현 그대로 position 파라미터에 넣는다(코드가 순서를 해석한다).
- 총액 맞추기, 견적 공개, 콘티 컷 삭제는 승인 도구를 호출하며 승인 전 완료했다고 말하지 않는다.
- 단가가 없는 새 견적 항목의 금액을 임의 생성하지 않는다.
- 단순 수정 결과는 변경 항목과 새 총액만 짧게 말한다.
- 명확한 업무 요청은 제공된 도구로 처리한다. 견적/계약/콘티뿐 아니라 캘린더, 이메일(Gmail), 워크플로우 단계 이동, 메일링 큐, 사진 갤러리, 오늘 브리핑/긴급 인사이트, 고객·프로젝트 검색, 미팅 준비/분석/후속조치, 상담 메모 저장도 각 도구로 직접 처리한다. 애매하면 추측하지 말고 되묻는다.
- 메모, 일정, 사진 갤러리, 셀렉 갤러리, 후기, 메일 초안, 올리비아 업무(agent_task)는 전용 도구가 없으면 create_feature_record/update_feature_record로 직접 생성·수정한다(고객/워크플로우 자체를 새로 만들거나 고쳐야 하면 이 도구로 하지 않는다 — 아직 지원하지 않는다). data는 그 기능의 필드만 담은 JSON 객체 문자열로 넣는다. 승인이 필요한 변경이면 도구가 알아서 승인 카드를 띄우니, 그 전에 "완료했다"고 말하지 않는다. 결과에 reviewRequired:true가 있으면 답변 끝에 "검토가 필요한 변경입니다." 문구를 반드시 그대로 덧붙인다 — 요약하면서 빠뜨리지 않는다.
- "OO 콘티 있어?"/"OO 콘티 찾아줘"/"OO 콘티 저장됐어?"처럼 기존 콘티 존재 여부를 묻는 요청은 반드시 get_conti_status로 먼저 확인한다. 도구를 안 쓰고 "없는 것 같다"고 추측해서 답하지 않는다 — 실제로 저장돼 있는데 못 찾았다고 잘못 답하는 사고가 있었다.
- "현재 단계 처리해줘"/"체크리스트 뭐 남았어" 같은 요청은 advance_workflow_step(특정 단계로 강제 이동)이 아니라 process_workflow_step(대기 업무 실행)/list_workflow_step_tasks(체크리스트 조회)를 쓴다. 체크리스트 항목 하나만 콕 집어 승인/처리해달라고 하면 approve_workflow_task를 쓴다. 이 세 도구가 "이 단계는 실제 문서가 있어야 넘어갈 수 있다"고 답하면 절대 advance_workflow_step으로 우회해서 억지로 넘기지 않는다 — 안내한 대로 견적서/계약서/콘티부터 만들라고 전달한다.
- 사용자가 "저장했는데 왜 없다고 해?"/"분명히 있다니까?"처럼 자료(견적서/계약서/콘티)가 시스템에 안 잡힌다고 항의하거나, "이 견적서/콘티를 OO병원에 연결해줘"라고 명시적으로 요청하면 — 고객/프로젝트 등록 전에 미리 만들어 병원명이 정확히 안 맞아 연결이 안 됐을 가능성이 크다. 이땐 link_document_to_client로 실제 고객에 연결한다. get_conti_status/process_workflow_step이 "못 찾았다"고 답한 직후 사용자가 반박하는 흐름에서 특히 이 도구를 떠올린다.
- "OO 실행해줘"/"OO 열어줘"/"OO 보여줘"처럼 특정 화면·기능을 열려는 요청은(그 기능이 위 목록의 전용 도구로 처리되는 게 아니라면) 무조건 open_feature를 먼저 호출한다. 절대 "그 기능은 지원하지 않는다"거나 "할 수 없다"고 스스로 판단해서 설명만 하고 끝내지 않는다 — 실제로 있는지 없는지는 open_feature 결과가 알려준다.
- "OO 촬영/견적/계약/납품 준비하자"처럼 여러 단계에 걸친 업무 묶음을 시작하는 요청은 start_task_session을 쓴다(Workflow 단계 하나만 처리하는 process_workflow_step과 다르다). 그 뒤 "계속하자"/"다음"은 continue_task_session, "지금 뭐 남았어?"/"어디까지 했지?"는 get_task_session_status, "보류"는 pause_task_session을 쓴다. "체크리스트 뭐 남았어"처럼 지금 이 단계 하나의 세부 항목만 묻는 게 명확하면 list_workflow_step_tasks를 그대로 쓴다 — get_task_session_status가 "진행 중인 Task Session이 없다"고 답하면 그때 list_workflow_step_tasks로 바꿔 시도해본다.
  - "OO병원 고객관리 페이지 열어줘"처럼 고객명이 함께 오면 hospitalName에 그 고객명을 채운다 — 그래야 고객 목록만 여는 게 아니라 그 고객이 바로 선택된 화면으로 연다.
  - matched:true면 화면이 열렸다는 뜻이니 "OO 열었어요" 정도로 짧게 답한다.
  - ambiguous:true면 candidates 목록을 그대로 사용자에게 보여주며 어느 걸 열지 되묻는다(임의로 하나를 골라 열지 않는다).
  - 도구가 실패(success:false)하면 그건 "존재하지 않는 기능"이라는 뜻이다 — "그런 기능은 없는 것 같아요"라고 답하되, 존재는 하는데 실행 중 오류가 난 다른 도구 실패와는 구분해서 말한다(예: 도구 자체 오류는 "여는 중 문제가 생겼어요. 다시 시도해볼게요"처럼 오류로 표현하고, open_feature가 "찾지 못했다"고 한 경우에만 없는 기능으로 표현한다).
- 도구 성공 결과를 받은 뒤에만 완료했다고 말한다.
- DB 생성/수정 결과에 포함된 실제 ID만 사용한다.
- 고객 공개, 계약 확정, 중요 데이터 삭제, 외부 발송은 확인 없이 실행하지 않는다.
- 내부 reasoning은 노출하지 않고 사용자에게 필요한 진행 상태만 짧게 알린다.
- 한국어로 간결하고 자연스럽게 답한다.
</operating_rules>`;
}

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
  const recentEntities = Array.isArray(input.recentEntities)
    ? input.recentEntities.flatMap((entity) => {
        if (!entity || typeof entity !== "object" || Array.isArray(entity)) return [];
        const row = entity as Record<string, unknown>;
        const type = optionalString(row.type);
        const id = optionalString(row.id);
        if (!type || !id) return [];
        return [{ type, id, name: optionalString(row.name), lastMentionedAt: optionalString(row.lastMentionedAt) || new Date(0).toISOString() }];
      }).slice(-10)
    : [];
  const aliasesInput = input.aliases && typeof input.aliases === "object" && !Array.isArray(input.aliases)
    ? input.aliases as Record<string, unknown>
    : {};
  const aliases: Record<string, { type: string; id: string; name: string }> = {};
  for (const [alias, ref] of Object.entries(aliasesInput)) {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) continue;
    const row = ref as Record<string, unknown>;
    const type = optionalString(row.type);
    const id = optionalString(row.id);
    const name = optionalString(row.name);
    if (type && id && name) aliases[alias] = { type, id, name };
  }
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
    recentEntities,
    aliases,
    revision: typeof input.revision === "number" ? input.revision : 0,
    lastTool: optionalString(input.lastTool),
    lastIntent: optionalString(input.lastIntent),
  };
}

function contextPrompt(context: OliviaContextSnapshot, pageContext?: string, temporalHint?: string) {
  const lines = [
    temporalHint ? `해석된 날짜(코드가 계산함 — 이 값을 그대로 쓴다): ${temporalHint}` : null,
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
    context.lastTool
      ? `마지막으로 실행한 도구: ${context.lastTool}${context.lastIntent ? ` (${context.lastIntent})` : ""} — "그거"/"그것도"/"아까 그거"가 이 도구를 다시 가리킬 수 있다.`
      : null,
    context.recentEntities?.length
      // 별칭/지시어 전처리(applyAliasRewrite/applyReferentRewrite)가 못 잡은 애매한 경우의
      // 마지막 안전망 — LLM이 참고해서 스스로 해석하거나, 그래도 애매하면 되묻는다.
      ? `최근 언급된 대상: ${context.recentEntities.slice(-5).map((e) => `${e.type}${e.name ? `(${e.name})` : ""}`).join(", ")}`
      : null,
    context.aliases && Object.keys(context.aliases).length
      ? `등록된 별칭: ${Object.entries(context.aliases).map(([alias, ref]) => `${alias}=${ref.name}`).join(", ")}`
      : null,
  ].filter((line): line is string => Boolean(line));
  if (pageContext) lines.unshift(`클라이언트 Page Context: ${pageContext}`);
  return lines.length ? lines.join("\n") : "선택된 고객, 프로젝트, Workspace가 없습니다.";
}

// 30턴 넘게 대화가 길어지면 그 이전 메시지는 toInputMessages()가 통째로 버린다(코드 요청서 5번
// 항목) — LLM으로 다시 요약하면 비용/지연이 들고 왜곡 위험도 있어서(문서에서 명시적으로 경고),
// 1차는 최소 버전으로 실제 assistant 응답 원문을 짧게 잘라 그대로 남긴다(지어내지 않음). assistant
// 응답은 운영 규칙상 "도구 성공 결과를 받은 뒤에만" 나오므로 사실상 이전 도구 실행 결과 요약이다.
function summarizeOlderMessages(rows: ConversationMessage[]): string | undefined {
  if (rows.length <= 30) return undefined;
  const lines = rows
    .slice(0, -30)
    .filter((row) => row.role === "assistant")
    .slice(-20)
    .map((row) => String(row.content || "").split("\n")[0].slice(0, 90))
    .filter(Boolean);
  return lines.length ? lines.join("\n") : undefined;
}

function toInputMessages(
  rows: ConversationMessage[],
  message: string,
  context: OliviaContextSnapshot,
  pageContext?: string,
  temporalHint?: string,
): ResponseInputItem[] {
  const history: ResponseInputItem[] = rows
    .slice(-30)
    .filter((row) => isWellFormedHistoryText(String(row.content || "")))
    .map((row) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: String(row.content || ""),
    }));
  return [
    ...history,
    {
      role: "user",
      content: `[Dynamic Context]\n${contextPrompt(context, pageContext, temporalHint)}\n\n[User Request]\n${message}`,
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

// 진짜 토큰 단위 스트리밍 대신, 검사를 통과한 텍스트를 짧은 간격으로 흘려보내 타이핑 느낌만
// 최대한 유지한다(완전 차단 방식 — 이상 문자가 화면에 뜨는 경우를 원천 차단하기 위해 실시간
// 스트리밍을 포기하기로 확정, 2026-08 코드 요청서).
async function flushTextAsDeltas(text: string, send: (event: OliviaStreamEvent) => void, messageId: string) {
  if (!text) return;
  const CHUNK_SIZE = 6;
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    send({ type: "text_delta", messageId, delta: text.slice(i, i + CHUNK_SIZE) });
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}

// 한 라운드의 응답 텍스트에 이상 문자가 섞여 있으면 클라이언트에 절대 보여주지 않는다 — 같은
// 요청을 1회만 재생성해보고, 그래도 안 되면 안전한 fallback 문구로 대체한다(재시도 반복은
// 비용/지연 때문에 하지 않는다). 원문은 서버 로그에만 남긴다.
async function runRoundWithSanitization(
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

function toolStatus(name: string) {
  if (name === "select_project") return "고객과 프로젝트를 확인하는 중…";
  if (name === "create_quote") return "견적 초안을 생성하는 중…";
  if (name === "create_contract") return "계약서 초안을 생성하는 중…";
  if (name === "create_conti") return "콘티 초안을 생성하는 중…";
  if (name === "get_conti_status") return "저장된 콘티를 확인하는 중…";
  if (name === "update_quote_item") return "견적을 수정하는 중…";
  if (["add_quote_item", "remove_quote_item", "update_quote_note", "apply_quote_discount", "update_quote_vat_mode"].includes(name)) return "견적을 수정하는 중…";
  if (name === "rebalance_quote_total") return "견적 조정안을 계산하는 중…";
  if (name === "add_conti_shots") return "콘티 컷을 구성하는 중…";
  if (["update_conti_shot", "remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot"].includes(name)) return "콘티를 수정하는 중…";
  if (name === "open_feature") return "화면을 찾는 중…";
  if (name === "list_workflow_step_tasks") return "업무 프로세스를 확인하는 중…";
  if (name === "process_workflow_step") return "현재 단계 업무를 처리하는 중…";
  if (name === "approve_workflow_task") return "업무를 처리하는 중…";
  if (name === "link_document_to_client") return "고객에 연결하는 중…";
  if (name === "create_feature_record") return "데이터를 생성하는 중…";
  if (name === "update_feature_record") return "데이터를 수정하는 중…";
  return "화면을 준비하는 중…";
}

export async function POST(req: NextRequest) {
  const requestStartedAt = performance.now();
  const requestId = crypto.randomUUID();
  const authenticated=isAdminSession(req);
  const authMs=performance.now()-requestStartedAt;
  if (!authenticated) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json() as Record<string, unknown>;
  const rawMessage = String(body.message || "").trim();
  if (!rawMessage) return Response.json({ ok: false, error: "메시지를 입력해주세요." }, { status: 400 });

  const context = normalizeContext(body.context);
  const pageContext = optionalString(body.pageContext);

  // Context Intelligence(코드 요청서 2026-08-17) — "히어" 같은 별칭이나 "그 병원"/"이거"/
  // "아까 거" 같은 지시어를, LLM을 부르기도 전에 결정론적으로(비용 없이) 실명으로 풀 수
  // 있으면 미리 풀어둔다. 이렇게 하면 이 아래의 orchestrator/GPT/도구 30여 개가 전부 코드
  // 수정 없이 그 혜택을 받는다(도구는 여전히 기존처럼 clientName 문자열을 받아 fuzzy 검색만
  // 한다 — 여기서 하는 일은 "히어"를 "히어산부인과"로 바꿔주는 것뿐). 애매하면(별칭/지시어
  // 자체가 없거나, 풀 수 있는 대상이 없으면) 원문을 그대로 두고 기존처럼 LLM이 처리한다.
  const aliasRewrite = applyAliasRewrite(context.aliases, rawMessage);
  const referentRewrite = applyReferentRewrite(aliasRewrite.text, context);
  const message = referentRewrite.text;
  const resolutionApplied = [...aliasRewrite.applied, ...referentRewrite.applied];
  if (resolutionApplied.length) {
    console.info("[OliviaContext] resolved", { rawMessage, message, resolutionApplied });
  }

  // Olivia Orchestrator: GPT를 부르기 전에 먼저 "코드가 사실을 확실히 아는" 두 가지 경우
  // (오늘/지금이 언제인지, 존재가 확실한 화면을 여는 것)를 결정적으로 처리할 수 있는지 확인한다.
  // 여기서 처리되면 OpenAI를 아예 호출하지 않는다 — 그래서 OPENAI_API_KEY 없이도 동작한다.
  const oliviaRuntime = buildOliviaRuntimeContext();
  const requestKind = classifyRequestKind(message);
  const deterministic = resolveDeterministicResponse(message, oliviaRuntime, context);

  const requestClass = classifyOliviaRequest(message, context);
  const model = routeOliviaModel(requestClass);
  const persistentAgentRun = shouldCreatePersistentAgentRun(message, requestClass);
  const selectedTools = selectOliviaTools({ requestClass, message, context });
  const databaseFastPath = hasDatabaseFastPath(message);
  if (!deterministic && !databaseFastPath && !persistentAgentRun && (!process.env.OPENAI_API_KEY || !model)) {
    return Response.json({ ok: false, error: "Olivia GPT 환경변수 설정을 확인해주세요." }, { status: 503 });
  }

  console.info("[OliviaRouter]", {
    requestKind,
    routeDecision: deterministic?.routeDecision ?? "GPT_FALLBACK",
    model: deterministic ? null : model,
    requestClass,
    clientId: context.activeClientId,
    projectId: context.activeProjectId,
    workspace: context.activeWorkspace,
    resourceId: context.activeResourceId,
    requestId,
    selectedToolCount: selectedTools.length,
    persistentAgentRun,
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let firstEventMs: number | undefined;
      let modelFirstTokenMs: number | undefined;
      let historyMs = 0;
      let contextMs = 0;
      let toolExecutionMs = 0;
      let toolRounds = 0;
      const send = (event: OliviaStreamEvent) => {
        if (!closed) {
          if (firstEventMs === undefined) firstEventMs = performance.now() - requestStartedAt;
          controller.enqueue(encoder.encode(encodeEvent(event)));
        }
      };
      const messageId = optionalString(body.responseId) || crypto.randomUUID();

      // 연결이 성립하면 DB 준비보다 먼저 UI가 즉시 응답 상태를 표시한다.
      send({ type: "message_start", messageId });
      send({ type: "agent_status", status: "요청을 확인했어요." });

      try {
        const db = getSupabaseAdmin();
        const contextStartedAt = performance.now();
        const owner = await ensurePrimaryAssistantOwner(db);
        const requestedConversationId = optionalString(body.conversationId);
        const [defaultConversation, requestedResult] = await Promise.all([
          getOrCreateAssistantConversation(db, owner.id),
          requestedConversationId
            ? db.from("assistant_conversations").select("id,owner_id").eq("id", requestedConversationId).eq("owner_id", owner.id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        const conversation = requestedResult.data
          ? requestedResult.data as { id: string; owner_id: string }
          : defaultConversation;
        contextMs = performance.now() - contextStartedAt;

        const historyStartedAt = performance.now();
        const [history, , conversationMetadataResult] = await Promise.all([listAssistantMessages(db, owner.id, conversation.id, 30), saveAssistantMessage(db, {
          ownerId: owner.id,
          conversationId: conversation.id,
          role: "user",
          // 사용자가 실제로 타이핑한 원문을 저장한다(화면에도 이게 그대로 보임) — 별칭/지시어를
          // 실명으로 치환한 message는 이 요청의 LLM 처리에만 쓰고 기록에는 안 남긴다.
          content: rawMessage,
          channel: "web",
          externalMessageId: optionalString(body.clientRequestId) || crypto.randomUUID(),
          metadata: { context, pageContext, requestClass, requestKind, routeDecision: deterministic?.routeDecision ?? "GPT_FALLBACK", resolvedMessage: message !== rawMessage ? message : undefined },
        }), db.from("assistant_conversations").select("metadata").eq("id",conversation.id).maybeSingle()]);
        const compactSummary=typeof conversationMetadataResult.data?.metadata?.compactSummary==="string"
          ? conversationMetadataResult.data.metadata.compactSummary as string
          : undefined;
        historyMs = performance.now() - historyStartedAt;

        send({ type: "message_start", messageId, conversationId: conversation.id });

        if (databaseFastPath) {
          const fastText=await resolveDatabaseFastPath(db,message,context,oliviaRuntime.todayISO);
          if(fastText){
            send({type:"text_delta",messageId,delta:fastText});
            await saveAssistantMessage(db,{ownerId:owner.id,conversationId:conversation.id,role:"assistant",content:fastText,channel:"web",metadata:{blocks:[{type:"text",text:fastText}],routeDecision:"DATABASE_FAST_PATH"}});
            send({type:"message_complete",messageId,conversationId:conversation.id});
            return;
          }
        }

        if (persistentAgentRun) {
          const created = await createAgentRun(db, {
            ownerId: owner.id,
            conversationId: conversation.id,
            clientId: context.activeClientId,
            workflowRunId: context.activeProjectId,
            goal: rawMessage,
            runType: inferPersistentRunType(message),
            source: "chat",
            idempotencyKey: optionalString(body.clientRequestId) || requestId,
            context: context as unknown as Record<string, unknown>,
            metadata: { requestClass, pageContext, clientName: context.activeClientName || inferPersistentRunClientName(message) },
          });
          const text = created.duplicate ? "이미 접수된 업무예요. Agent Center에서 진행 상황을 이어서 볼 수 있어요." : "업무를 접수했어요. 페이지를 이동하거나 창을 닫아도 계속 진행하며, 승인이 필요하면 멈추고 알려드릴게요.";
          send({ type: "run_created", run: { id: created.run.id, goal: created.run.goal, status: created.run.status, progress: created.run.progress, currentStepKey: created.run.current_step_key || undefined } });
          send({ type: "text_delta", messageId, delta: text });
          await saveAssistantMessage(db, { ownerId: owner.id, conversationId: conversation.id, role: "assistant", content: text, channel: "web", metadata: { blocks: [{ type: "text", text }], agentRunId: created.run.id } });
          send({ type: "message_complete", messageId, conversationId: conversation.id });
          return;
        }

        // ── Deterministic bypass: 오늘/지금 질문이나 고신뢰 화면 이동은 GPT를 거치지 않는다 ──
        if (deterministic) {
          send({ type: "text_delta", messageId, delta: deterministic.text });
          for (const action of deterministic.uiActions) send({ type: "ui_action", action });
          await saveAssistantMessage(db, {
            ownerId: owner.id,
            conversationId: conversation.id,
            role: "assistant",
            content: deterministic.text,
            channel: "web",
            parentMessageId: undefined,
            metadata: { blocks: [{ type: "text", text: deterministic.text }], routeDecision: deterministic.routeDecision },
          });
          send({ type: "message_complete", messageId, conversationId: conversation.id });
          return;
        }

        if (!model) throw new Error("Olivia GPT 모델을 확인해주세요.");

        send({ type: "agent_status", status: "요청을 이해하는 중…" });

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const temporal = resolveTemporalExpression(message, oliviaRuntime);
        const temporalHint = temporal
          ? temporal.kind === "date"
            ? `${temporal.label} = ${temporal.date}`
            : `${temporal.label} = ${temporal.start} ~ ${temporal.end}`
          : undefined;
        // Responses API는 previous_response_id로 input은 이어주지만 instructions는 자동으로
        // 이어주지 않는다 — 매 라운드 같은 instructions를 다시 넣지 않으면 도구 실행 후속 응답에서
        // 오늘 날짜/운영 규칙이 통째로 빠진다(설계 문서 5절, 2026-08-14 확인된 버그).
        const instructions = buildSystemPrompt(oliviaRuntime, compactSummary || summarizeOlderMessages(history));
        // 서로 무관한 조회 도구들(예: "오늘 일정 보여주고 이번주 미결 견적도 알려줘")을 모델이 한
        // 라운드에 같이 요청할 수 있게 허용한다 — 실제 실행은 아래 for(toolCall of response.toolCalls)
        // 루프가 여전히 순차(await 직렬)로 처리하므로, 같은 라운드에 mutation 도구 2개가 와도
        // 실행 순서 자체는 항상 모델이 나열한 순서 그대로 보장된다(2026-08-15, 코드 요청서 1번 항목).
        let request: StreamingRequest = {
          instructions,
          input: toInputMessages(history, message, context, pageContext, temporalHint),
          tools: selectedTools,
          parallel_tool_calls: true,
        };
        let workingContext = context;
        let finalText = "";
        const executedToolCalls = new Set<string>();

        for (let round = 0; round < maxToolRounds(requestClass); round += 1) {
          toolRounds = round + 1;
          const response = await runRoundWithSanitization({
            openai,
            model,
            request,
            signal: req.signal,
            onFirstToken: () => { if (modelFirstTokenMs === undefined) modelFirstTokenMs = performance.now() - requestStartedAt; },
          });
          await flushTextAsDeltas(response.text, send, messageId);
          finalText += response.text;
          if (!response.toolCalls.length) break;
          if (!response.responseId) throw new Error("OpenAI tool response ID가 없습니다.");

          const outputs: ResponseInputItem[] = [];
          const uniqueCalls: OliviaToolCall[] = [];
          for (const toolCall of response.toolCalls) {
            const signature = `${toolCall.name}:${toolCall.arguments}`;
            if (executedToolCalls.has(signature)) {
              outputs.push({ type: "function_call_output", call_id: toolCall.id, output: JSON.stringify({ success: false, message: OLIVIA_FALLBACK_MESSAGES.duplicateToolCall }) });
              continue;
            }
            executedToolCalls.add(signature);
            uniqueCalls.push(toolCall);
          }
          const toolStartedAt = performance.now();
          const executions = await executeOliviaToolBatch(uniqueCalls, async (toolCall) => {
            send({ type: "agent_status", status: toolStatus(toolCall.name) });
            send({ type: "tool_start", tool: toolCall.name, toolCallId: toolCall.id });
            console.info("[olivia-v2] tool requested", { tool: toolCall.name, round });

            const execution = await executeAgentTool(toolCall, workingContext);
            const toolPayload = execution.result.success
              ? execution.result.data || {}
              : { message: execution.result.error || OLIVIA_FALLBACK_MESSAGES.toolFailureGeneric };
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
            return { execution, toolPayload };
          });
          toolExecutionMs += performance.now() - toolStartedAt;
          for (const { call: toolCall, result: { execution, toolPayload } } of executions) {
            outputs.push({
              type: "function_call_output",
              call_id: toolCall.id,
              output: JSON.stringify({ success: execution.result.success, ...toolPayload }),
            });
          }

          send({ type: "agent_status", status: "결과를 정리하는 중…" });
          request = {
            instructions,
            previous_response_id: response.responseId,
            input: outputs,
            tools: selectedTools,
            parallel_tool_calls: true,
          };
        }

        if (!finalText.trim()) finalText = OLIVIA_FALLBACK_MESSAGES.emptyResponseFallback;
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
        const summaryLines=history.slice(-12).concat([{role:"assistant",content:finalText} as ConversationMessage])
          .map((row)=>`${row.role}: ${String(row.content||"").replace(/\s+/g," ").slice(0,180)}`);
        const nextSummary=[compactSummary,...summaryLines].filter(Boolean).join("\n").slice(-4000);
        await db.from("assistant_conversations").update({metadata:{...(conversationMetadataResult.data?.metadata||{}),compactSummary:nextSummary,summaryCursor:new Date().toISOString()}}).eq("id",conversation.id);
      } catch (error) {
        if (req.signal.aborted) {
          console.info("[olivia-v2] response cancelled");
        } else {
          console.error("[olivia-v2] stream failed", error);
          send({
            type: "error",
            message: OLIVIA_FALLBACK_MESSAGES.streamFailure,
            retryable: true,
          });
        }
      } finally {
        console.info("[OliviaPerformance]", {
          requestId,
          authMs: Math.round(authMs),
          contextMs: Math.round(contextMs),
          historyMs: Math.round(historyMs),
          firstEventMs: Math.round(firstEventMs ?? 0),
          modelFirstTokenMs: modelFirstTokenMs === undefined ? null : Math.round(modelFirstTokenMs),
          toolExecutionMs: Math.round(toolExecutionMs),
          totalMs: Math.round(performance.now() - requestStartedAt),
          model: deterministic || persistentAgentRun ? null : model,
          requestClass,
          selectedToolCount: selectedTools.length,
          toolRounds,
        });
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
