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
  mergeAssistantConversationMetadata,
  saveAssistantMessage,
  updateAssistantApprovalBlockState,
} from "@/lib/assistant/conversations/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import { classifyOliviaRequest, routeOliviaModel } from "@/lib/olivia/v2/modelRouter";
import { isDirectToolExecutionEnabled, resolveOliviaEngineRoute } from "@/lib/olivia/v2/engineRouting";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { OliviaAgentToolExecution, OliviaContextSnapshot, OliviaStreamEvent, OliviaToolCall, OliviaToolResult } from "@/lib/olivia/v2/types";
import { buildOliviaRuntimeContext } from "@/lib/olivia/runtime/buildRuntimeContext";
import type { OliviaRuntimeContext } from "@/lib/olivia/runtime/types";
import { resolveTemporalExpression } from "@/lib/olivia/runtime/temporalResolver";
import { resolveDeterministicResponse } from "@/lib/olivia/orchestrator/handleRequest";
import { classifyRequestKind } from "@/lib/olivia/orchestrator/classifyRequest";
import { applyAliasRewrite } from "@/lib/olivia/intelligence/aliasResolver";
import { applyReferentRewrite } from "@/lib/olivia/intelligence/referentResolver";
import { buildCanonicalRecentUserText, buildLastActionFollowupHint, getOliviaToolDomains, isReadOnlyOliviaTool, resolveRequiredFollowupTool, resolveToollessActionRetry, restoreDocumentContextFromHistory, selectOliviaTools } from "@/lib/olivia/v2/toolSelection";
import { listActiveMemories } from "@/lib/olivia/memory/repository";
import { formatMemoryForPrompt, toHermesMemoryEntry } from "@/lib/olivia/memory/format";
import type { OliviaMemoryRow } from "@/lib/olivia/memory/types";
import { executeOliviaToolBatch } from "@/lib/olivia/v2/toolScheduler";
import { inferPersistentRunClientName, inferPersistentRunType, shouldCreatePersistentAgentRun } from "@/lib/olivia/v2/persistentRunClassifier";
import { createAgentRun } from "@/lib/olivia/agentRuns/service";
import { hasDatabaseFastPath, resolveDatabaseFastPath } from "@/lib/olivia/v2/databaseFastPath";
import { createStreamingScriptGuard, detectAbnormalScript, isWellFormedHistoryText } from "@/lib/olivia/output/scriptSanitizer";
import { resolveHermesDisplayText } from "@/lib/olivia/output/hermesDisplayText";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import { buildQuoteRoundConfirmation } from "@/lib/olivia/output/quoteConfirmations";
import { buildContractRoundConfirmation } from "@/lib/olivia/output/contractConfirmations";
import { resolveDocumentBrand } from "@/lib/olivia/brandResolver";
import { getOliviaAgentEngine, isClientSearchRequest, isMutationIntent, isUiExecutionIntent } from "@/lib/hermes/client";
import { BrainUnavailableError, hermesProvider, isBrainFallbackSafe } from "@/lib/assistant/brain";
import type { AssistantChannel } from "@/lib/assistant/types";
import { sanitizeOliviaAttachments } from "@/lib/olivia/chatAttachments";
import { buildHermesRuntime, resourceSessionMetadata } from "@/lib/hermes/runtimeContext";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import {
  pendingActionBlock,
  pendingActionFromUiAction,
  pendingActionPromptContext,
  readPendingAction,
  resolvePendingActionContext,
  resolvePendingActionTurn,
  transitionPendingAction,
  type OliviaPendingAction,
} from "@/lib/olivia/conversation/dialogueState";
import { renderOliviaOutcome, renderVerifiedToolRound, resolveHermesFinalText, toolResultOutcome } from "@/lib/olivia/conversation/response";
import { isSystemStatusChatRequest } from "@/lib/system-status/chatIntent";
import { collectSystemStatus } from "@/lib/system-status/service";
import { formatSystemStatusForChat } from "@/lib/system-status/format";
import {
  executePhotoDirectTurn,
  isPhotoDirectExecutionEnabled,
  parsePhotoDirectCommand,
  readPendingPhotoDirectExecution,
  shouldGuardPhotoDirectTurn,
} from "@/lib/photo-storage/directChatExecution";
import { isClientScopedExecutionRequest, isHermesToolMiss } from "@/lib/olivia/v2/executionIntent";
// PHASE 4 작업 5(2026-09-25) — route.ts를 400줄 안팎으로 줄이려고 순수 헬퍼를 lib/olivia/v2/stream/*로
// 옮겼다. 동작 변경 없음 — 그대로 옮기고 import만 바꿨다.
import { maxToolRounds } from "@/lib/olivia/v2/stream/turnLimits";
import { buildSystemPrompt } from "@/lib/olivia/v2/stream/systemPrompt";
import {
  type ConversationMessage,
  contextPrompt,
  normalizeContext,
  optionalBoolean,
  optionalString,
  summarizeOlderMessages,
  toInputMessages,
  updateWorkingContext,
} from "@/lib/olivia/v2/stream/contextPrompt";
import { type StreamingRequest, flushTextAsDeltas, runRoundWithSanitization } from "@/lib/olivia/v2/stream/scriptGuard";
import { toolStatus } from "@/lib/olivia/v2/stream/toolStatusLabels";
import { PHOTO_DIRECT_TOOL_TIMEOUT_MS, PHOTO_DIRECT_TURN_TIMEOUT_MS, executePhotoToolBeforeDeadline } from "@/lib/olivia/v2/stream/photoDirectTool";
import { resourceMetadataFromTool } from "@/lib/olivia/v2/stream/resourceMetadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function encodeEvent(event: OliviaStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function isInternalServerRequest(req: NextRequest): boolean {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return false;
  return req.headers.get("x-internal-key") === key;
}

export async function POST(req: NextRequest) {
  const requestStartedAt = performance.now();
  const requestId = crypto.randomUUID();
  // 관리자 세션(브라우저 쿠키) 또는 내부 서버 호출(Telegram의 Anthropic 크레딧 소진 시
  // 대체 경로, app/api/telegram/route.ts와 동일한 x-internal-key 패턴) 둘 중 하나만
  // 통과하면 된다 — Telegram은 브라우저 쿠키가 없다.
  const internalRequest = isInternalServerRequest(req);
  const authenticated = isAdminSession(req) || internalRequest;
  const authMs=performance.now()-requestStartedAt;
  if (!authenticated) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json() as Record<string, unknown>;
  const rawMessage = String(body.message || "").trim();
  if (!rawMessage) return Response.json({ ok: false, error: "메시지를 입력해주세요." }, { status: 400 });
  const configuredAgentEngine = getOliviaAgentEngine();
  const messageChannel: AssistantChannel = internalRequest && body.channel === "telegram" ? "telegram" : "web";
  const persistedUserMessageId = internalRequest ? optionalString(body.persistedUserMessageId) : undefined;
  const assistantExternalMessageId = internalRequest
    ? optionalString(body.assistantExternalMessageId)
    : optionalString(body.responseId);
  const inboundAttachments = sanitizeOliviaAttachments(body.attachments);

  const normalizedContext = normalizeContext(body.context);
  const resolvedBrand = resolveDocumentBrand({
    message: rawMessage,
    contextBrand: normalizedContext.brand,
    activeClientName: normalizedContext.activeClientName,
  });
  // 이번 요청에만 사용하는 유효 Context다. 전역 store나 전체 고객 객체를 복사하지 않으며,
  // 실제 문서/Workspace가 열리면 각 기능 store가 계속 Source of Truth가 된다.
  const context = resolvedBrand
    ? { ...normalizedContext, brand: resolvedBrand }
    : normalizedContext;
  const pageContext = optionalString(body.pageContext);
  const replyContext = body.replyContext && typeof body.replyContext === "object" && !Array.isArray(body.replyContext)
    ? body.replyContext as Record<string, unknown>
    : undefined;

  // Context Intelligence(코드 요청서 2026-08-17) — "히어" 같은 별칭이나 "그 병원"/"이거"/
  // "아까 거" 같은 지시어를, LLM을 부르기도 전에 결정론적으로(비용 없이) 실명으로 풀 수
  // 있으면 미리 풀어둔다. 이렇게 하면 이 아래의 orchestrator/GPT/도구 30여 개가 전부 코드
  // 수정 없이 그 혜택을 받는다(도구는 여전히 기존처럼 clientName 문자열을 받아 fuzzy 검색만
  // 한다 — 여기서 하는 일은 "히어"를 "히어산부인과"로 바꿔주는 것뿐). 애매하면(별칭/지시어
  // 자체가 없거나, 풀 수 있는 대상이 없으면) 원문을 그대로 두고 기존처럼 LLM이 처리한다.
  const aliasRewrite = applyAliasRewrite(context.aliases, rawMessage);
  const referentRewrite = applyReferentRewrite(aliasRewrite.text, context);
  const message = referentRewrite.text;
  // Hermes/MCP 자체가 끊긴 상황을 진단하는 요청은 모델이나 MCP에 맡기면 영원히 실행될 수 없다.
  // 그래서 이 의도만큼은 Olivia 서버가 직접 판정하고 아래 스트림 앞단에서 읽기 전용 점검한다.
  const systemStatusChatRequest = isSystemStatusChatRequest(message);
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
  const recentUserText = optionalString(body.recentUserText);
  let selectedTools = selectOliviaTools({ requestClass, message, context, recentText: recentUserText });
  // Adaptive Memory용 scope만 여기서 미리 계산해둔다(순수 함수, DB 호출 없음) — 실제 조회는
  // 스트림 안에서 history 등 기존에 이미 병렬로 부르던 DB 호출들과 함께 묶는다. 예전엔 여기서
  // 바로 await listActiveMemories(...)를 했는데, deterministic/fast-path/persistentAgentRun처럼
  // LLM/도구가 아예 필요 없는 요청까지 스트림이 시작하기도 전에 Supabase 왕복 하나를 더 기다리게
  // 만들어서 "셀렉매칭" 같은 요청까지 체감상 느려졌다(2026-08-24 사용자 리포트) — 특히 마이그레이션
  // 미적용 상태(테이블 없음)에서는 매 요청마다 실패하는 조회를 순차로 기다린 셈이라 더 심했다.
  const memoryScopes = getOliviaToolDomains(message, context, recentUserText);
  const databaseFastPath = hasDatabaseFastPath(message);
  const engineRoute = resolveOliviaEngineRoute({
    configuredEngine: configuredAgentEngine,
    requestClass,
    directToolExecutionEnabled: isDirectToolExecutionEnabled(),
    deterministicAction: Boolean(deterministic),
    databaseFastPath,
    uiExecutionIntent: isUiExecutionIntent(message),
  });
  const useHermes = engineRoute.useHermes;
  if (!systemStatusChatRequest && !useHermes && !deterministic && !databaseFastPath && !persistentAgentRun && (!process.env.OPENAI_API_KEY || !model)) {
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
    requestedAgentEngine: engineRoute.requestedEngine,
    agentEngine: engineRoute.actualEngine,
    directToolExecutionEnabled: engineRoute.directToolExecutionEnabled,
    engineRouteReason: engineRoute.reason,
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let activeAgentEngine: "hermes" | "legacy" = engineRoute.actualEngine;
      // [임시 진단] 이번 요청이 실제로 어떤 Brain으로 처리됐는지 — Hermes 성공/폴백/애초에
      // 레거시 GPT로 시작(=Hermes 시도조차 안 함) 셋을 명확히 구분한다. 사용자에게는 이 구분이
      // 전혀 보이지 않으므로 개발/디버깅 전용이다(운영 로그 + non-production message_complete에만 노출).
      let chatRouteLabel: "HERMES" | "FALLBACK" | "LEGACY_GPT" | "DIRECT_TOOL" | undefined;
      // Secure Tunnel 개편 §6 — Hermes가 요청됐지만(requestedEngine) 실제로는 legacy로
      // 처리됐을 때(actualEngine) 그 이유를 diagnostics에 남긴다.
      let fallbackReason: string | undefined;
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
        if (systemStatusChatRequest) {
          send({ type: "agent_status", status: "Olivia 시스템 연결을 직접 점검하는 중…" });
          const report = await collectSystemStatus();
          const text = formatSystemStatusForChat(report);
          send({ type: "text_delta", messageId, delta: text });

          // Supabase 자체 장애도 진단할 수 있어야 하므로 진단 응답은 DB 저장보다 먼저 보낸다.
          // 대화 저장은 best-effort이며, 실패해도 이미 만들어진 진단 응답을 에러로 바꾸지 않는다.
          let conversationId: string | undefined;
          let persistedMessageId: string | undefined;
          try {
            const db = getSupabaseAdmin();
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
            conversationId = conversation.id;
            const userMessage = persistedUserMessageId
              ? await db.from("olivia_chat_messages").select("id").eq("id", persistedUserMessageId).eq("owner_id", owner.id).eq("conversation_id", conversation.id).eq("role", "user").single()
              : await saveAssistantMessage(db, {
                ownerId: owner.id,
                conversationId: conversation.id,
                role: "user",
                content: rawMessage,
                channel: messageChannel,
                externalMessageId: optionalString(body.clientRequestId) || crypto.randomUUID(),
                metadata: { context, pageContext, routeDecision: "SYSTEM_STATUS_DIRECT" },
              });
            const userMessageId = "message" in userMessage
              ? String(userMessage.message.id)
              : String(userMessage.data?.id ?? "");
            const saved = await saveAssistantMessage(db, {
              ownerId: owner.id,
              conversationId: conversation.id,
              role: "assistant",
              content: text,
              channel: messageChannel,
              externalMessageId: assistantExternalMessageId,
              parentMessageId: userMessageId || undefined,
              deliveryStatus: messageChannel === "telegram" ? "queued" : undefined,
              metadata: {
                blocks: [{ type: "text", text }],
                routeDecision: "SYSTEM_STATUS_DIRECT",
                systemStatusIssueCount: report.issueCount,
              },
            });
            persistedMessageId = String(saved.message.id);
          } catch (persistError) {
            console.warn("[system-status] 채팅 기록 저장 실패", persistError instanceof Error ? persistError.message : persistError);
          }

          send({
            type: "message_complete",
            messageId,
            conversationId,
            persistedMessageId,
            resolvedContext: {
              clientId: context.activeClientId,
              clientName: context.activeClientName,
              projectId: context.activeProjectId,
              projectName: context.activeProjectName,
            },
          });
          return;
        }

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
        // taughtMemories는 deterministic/fast-path/persistentAgentRun이면 아예 안 쓰지만, 그 판단
        // 자체가 이 아래에서 일어나고 history/saveAssistantMessage도 그 판단과 무관하게 항상 먼저
        // 불러오던 기존 구조라, 같은 Promise.all에 얹어도 그 경로들의 지연 시간이 늘지 않는다(이미
        // 지불하던 병렬 호출 묶음에 하나 더 낀 것뿐 — 순차 대기가 아니다).
        const userMessagePromise = persistedUserMessageId
          ? db.from("olivia_chat_messages")
            .select("id")
            .eq("id", persistedUserMessageId)
            .eq("owner_id", owner.id)
            .eq("conversation_id", conversation.id)
            .eq("role", "user")
            .single()
            .then(({ data, error }) => {
              if (error || !data) throw new Error("저장된 Telegram 메시지를 찾지 못했어요.");
              return { message: data, duplicate: true };
            })
          : saveAssistantMessage(db, {
            ownerId: owner.id,
            conversationId: conversation.id,
            role: "user",
            // 사용자가 실제로 타이핑한 원문을 저장한다(화면에도 이게 그대로 보임) — 별칭/지시어를
            // 실명으로 치환한 message는 이 요청의 LLM 처리에만 쓰고 기록에는 안 남긴다.
            content: rawMessage,
            channel: messageChannel,
            externalMessageId: optionalString(body.clientRequestId) || crypto.randomUUID(),
            metadata: {
              context,
              pageContext,
              requestClass,
              requestKind,
              routeDecision: deterministic?.routeDecision ?? "GPT_FALLBACK",
              resolvedMessage: message !== rawMessage ? message : undefined,
              ...(replyContext ? { replyContext } : {}),
              ...(inboundAttachments.length ? { attachments: inboundAttachments } : {}),
            },
          });
        const [historyRows, userMessageResult, conversationMetadataResult, taughtMemories] = await Promise.all([
          listAssistantMessages(db, owner.id, conversation.id, 30),
          userMessagePromise,
          db.from("assistant_conversations").select("metadata").eq("id",conversation.id).maybeSingle(),
          listActiveMemories(db, { scopes: memoryScopes }),
        ]);
        // Telegram inbound는 v2 호출 전에, Web inbound도 이 병렬 구간에서 canonical store에
        // 저장된다. 현재 메시지가 history 조회에 잡히더라도 message 인자와 중복되지 않게 제외한다.
        const userMessageId = String(userMessageResult.message.id);
        const history = historyRows.filter((row) => row.id !== userMessageId);
        // 현재 요청 원문은 Quote Engine의 결정론적 mode guard에 전달한다. 모델이 packageId를
        // 잘못 채워도 원문에 "패키지"가 없으면 CUSTOM으로 강제하기 위한 실행 전용 값이다.
        let effectiveContext = restoreDocumentContextFromHistory({ ...context, currentRequestText: rawMessage }, history);
        const conversationMetadata = conversationMetadataResult.data?.metadata && typeof conversationMetadataResult.data.metadata === "object"
          ? conversationMetadataResult.data.metadata as Record<string, unknown>
          : {};
        // 사진 작업은 NAS 원본을 다루므로 일반 엔진 라우팅과 독립된 결정론적 안전 경로를 쓴다.
        // 반드시 사용자 원문만 판정하며 OLIVIA_PHOTO_DIRECT_EXECUTION 하나로만 켜고 끈다.
        const photoDirectExecutionEnabled = isPhotoDirectExecutionEnabled();
        const pendingPhotoDirectExecution = readPendingPhotoDirectExecution(conversationMetadata);
        // 사진 직접 실행 우회는 현재 사용자가 직접 입력한 원문만 판정한다. alias/referent rewrite,
        // Hermes 답변, 대화 요약 또는 memory 문구가 사진 명령으로 승격되면 안 된다.
        const photoDirectTurn = shouldGuardPhotoDirectTurn({
          enabled: photoDirectExecutionEnabled,
          userMessage: rawMessage,
          pendingState: pendingPhotoDirectExecution,
        });
        let pendingAction = readPendingAction(conversationMetadata);
        const pendingTurn = resolvePendingActionTurn(rawMessage, pendingAction);
        const pendingPromptHint = pendingTurn === "correction" && pendingAction
          ? `[사용자가 수정한 직전 승인안]\n${pendingAction.prompt}\n기존 입력은 실행하지 말고 이번 메시지의 새 조건으로 다시 계산하거나 확인한다.`
          : pendingActionPromptContext(pendingAction);
        // §7/§8 "왜 안 바뀌는 거야?" 같은 후속 항의를 새 Intent로 재분류하지 않는다 — 직전
        // turn에 실제로 어떤 Tool이 실행됐는지(성공/실패)를 짧게 복기시킨다.
        const lastActionHint = buildLastActionFollowupHint(rawMessage, history);
        const historyHint = [pendingPromptHint, lastActionHint].filter(Boolean).join("\n\n") || undefined;
        if (pendingAction) effectiveContext = resolvePendingActionContext(effectiveContext, pendingAction);
        const canonicalRecentUserText = buildCanonicalRecentUserText(history);
        const effectiveRecentUserText = [canonicalRecentUserText, recentUserText].filter(Boolean).join("\n");
        selectedTools = selectOliviaTools({ requestClass, message, context: effectiveContext, recentText: effectiveRecentUserText });
        const requiredFollowupTool = requestClass === "TOOL_ACTION"
          ? resolveRequiredFollowupTool({ message, recentText: effectiveRecentUserText, availableToolNames: selectedTools.map((tool) => tool.name) })
          : undefined;
        if (requiredFollowupTool || canonicalRecentUserText) {
          console.info("[OliviaContext] canonical history restored", {
            requestId,
            requiredFollowupTool,
            selectedToolCount: selectedTools.length,
          });
        }
        // [임시 진단] production에서는 절대 노출하지 않는다 — VERCEL_ENV가 있으면(Vercel 배포)
        // 그 값을 기준으로, 없으면(순수 로컬) NODE_ENV를 기준으로 판단한다.
        const isDevDiagnostics = process.env.VERCEL_ENV
          ? process.env.VERCEL_ENV !== "production"
          : process.env.NODE_ENV !== "production";
        let resolvedContextForMessage = {
          clientId: effectiveContext.activeClientId,
          clientName: effectiveContext.activeClientName,
          projectId: effectiveContext.activeProjectId,
          projectName: effectiveContext.activeProjectName,
        };
        // PHASE 4 작업 1(2026-09-25) — 폴백이 일어난 턴은 한 곳(여기)에서만 기록하면 이후 모든
        // saveTurnAssistant 호출(hermes 성공/legacy/deterministic/fast-path 등 어디로 가든)이
        // 자동으로 agentEngine/fallbackReason을 DB metadata와 SSE 이벤트 둘 다에 싣는다. 호출부가
        // 이미 명시한 값(예: hermes 성공 경로의 agentEngine:"hermes")은 그대로 우선한다.
        const saveTurnAssistant = async (content: string, metadata: Record<string, unknown>) => {
          const enrichedMetadata = {
            agentEngine: activeAgentEngine,
            ...(fallbackReason ? { fallbackReason } : {}),
            ...metadata,
          };
          const saved = await saveAssistantMessage(db, {
            ownerId: owner.id,
            conversationId: conversation.id,
            role: "assistant",
            content,
            channel: messageChannel,
            externalMessageId: assistantExternalMessageId,
            parentMessageId: userMessageId,
            deliveryStatus: messageChannel === "telegram" ? "queued" : undefined,
            metadata: enrichedMetadata,
          });
          send({
            type: "message_complete",
            messageId,
            conversationId: conversation.id,
            persistedMessageId: String(saved.message.id),
            resolvedContext: resolvedContextForMessage,
            agentEngine: activeAgentEngine,
            ...(fallbackReason ? { fallbackReason } : {}),
            ...(isDevDiagnostics && chatRouteLabel ? { chatRoute: chatRouteLabel } : {}),
          });
          return saved.message;
        };
        const compactSummary=typeof conversationMetadata.compactSummary==="string"
          ? conversationMetadata.compactSummary
          : undefined;
        historyMs = performance.now() - historyStartedAt;

        send({ type: "message_start", messageId, conversationId: conversation.id });

        const replyClientId = optionalString(replyContext?.clientId);
        const replyClientName = optionalString(replyContext?.clientName);
        const replyProjectId = optionalString(replyContext?.projectId);
        const replyProjectName = optionalString(replyContext?.projectName);
        const trustedClientId = replyClientId || context.activeClientId;
        if (isClientScopedExecutionRequest(message) && !trustedClientId) {
          const text = "이 작업을 실행할 고객이 선택되지 않았습니다. 먼저 견적서·계약서·콘티를 열거나 고객을 지정해주세요.";
          send({ type: "text_delta", messageId, delta: text });
          await saveTurnAssistant(text, {
            blocks: [{ type: "text", text }],
            routeDecision: "CLIENT_CONTEXT_REQUIRED",
          });
          return;
        }
        if (isClientScopedExecutionRequest(message)) {
          effectiveContext = {
            ...effectiveContext,
            activeClientId: trustedClientId,
            activeClientName: replyClientName || context.activeClientName,
            activeProjectId: replyProjectId || context.activeProjectId,
            activeProjectName: replyProjectName || context.activeProjectName,
          };
          resolvedContextForMessage = {
            clientId: effectiveContext.activeClientId,
            clientName: effectiveContext.activeClientName,
            projectId: effectiveContext.activeProjectId,
            projectName: effectiveContext.activeProjectName,
          };
        }

        // 승인을 기다리는 작업에 대한 짧은 답은 모델/Hermes에 다시 해석시키지 않는다. 대화에
        // 저장된 정확한 tool/input/대상을 그대로 사용해야 채널이나 런타임 상태가 달라도 같은
        // 작업이 실행된다.
        if (pendingAction && pendingTurn !== "none" && pendingTurn !== "correction") {
          if (pendingTurn === "reject" || pendingTurn === "defer") {
            let text = pendingTurn === "defer"
              ? renderOliviaOutcome({ status: "deferred", targetTitle: pendingAction.target?.title })
              : renderOliviaOutcome({ status: "rejected" });
            let toolCall: Record<string, unknown> | undefined;
            const temporaryDocumentId = typeof pendingAction.toolInput.temporaryDocumentId === "string"
              ? pendingAction.toolInput.temporaryDocumentId
              : undefined;
            if (pendingTurn === "defer" && temporaryDocumentId) {
              const deferred = await executeAgentTool({
                id: `${pendingAction.id}:defer`,
                name: "defer_temporary_document",
                arguments: JSON.stringify({ temporaryDocumentId }),
              }, resolvePendingActionContext(effectiveContext, pendingAction));
              toolCall = { id: `${pendingAction.id}:defer`, name: "defer_temporary_document", success: deferred.result.success, verification: deferred.result.verification };
              text = renderOliviaOutcome(toolResultOutcome(deferred.result, pendingAction));
            }
            pendingAction = transitionPendingAction(pendingAction, pendingTurn === "defer" ? "deferred" : "rejected");
            await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId: conversation.id, metadata: { pendingAction } });
            await updateAssistantApprovalBlockState(db, { ownerId: owner.id, conversationId: conversation.id, approvalId: pendingAction.id, state: "cancelled" });
            send({ type: "text_delta", messageId, delta: text });
            await saveTurnAssistant(text, { blocks: [{ type: "text", text }], dialogueResolution: pendingTurn, ...(toolCall ? { toolCalls: [toolCall] } : {}) });
            return;
          }

          pendingAction = transitionPendingAction(pendingAction, "approved");
          await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId: conversation.id, metadata: { pendingAction } });
          const pendingContext = resolvePendingActionContext(effectiveContext, pendingAction);
          send({ type: "agent_status", status: toolStatus(pendingAction.toolName) });
          send({ type: "tool_start", tool: pendingAction.toolName, toolCallId: pendingAction.id });
          const execution = await executeAgentTool({ id: pendingAction.id, name: pendingAction.toolName, arguments: JSON.stringify(pendingAction.toolInput) }, pendingContext);
          const toolPayload = execution.result.success
            ? execution.result.data || {}
            : { message: execution.result.error || OLIVIA_FALLBACK_MESSAGES.toolFailureGeneric };
          send({ type: "tool_result", tool: pendingAction.toolName, toolCallId: pendingAction.id, success: execution.result.success, result: toolPayload });

          let nextPendingAction: OliviaPendingAction | undefined;
          let workingPendingContext = pendingContext;
          for (const action of execution.uiActions) {
            send({ type: "ui_action", action });
            nextPendingAction = pendingActionFromUiAction(action, workingPendingContext) || nextPendingAction;
            workingPendingContext = updateWorkingContext(workingPendingContext, action);
          }
          const text = nextPendingAction
            ? renderOliviaOutcome({ status: "needs_confirmation", prompt: nextPendingAction.prompt })
            : renderOliviaOutcome(toolResultOutcome(execution.result, pendingAction));
          const resolvedAction = nextPendingAction || transitionPendingAction(pendingAction, execution.result.success ? "completed" : "failed");
          await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId: conversation.id, metadata: { pendingAction: resolvedAction } });
          await updateAssistantApprovalBlockState(db, { ownerId: owner.id, conversationId: conversation.id, approvalId: pendingAction.id, state: execution.result.success ? "approved" : "error" });
          send({ type: "text_delta", messageId, delta: text });
          const approvalBlock = pendingActionBlock(nextPendingAction);
          await saveTurnAssistant(text, {
            blocks: [{ type: "text", text }, ...(approvalBlock ? [approvalBlock] : [])],
            dialogueResolution: "approve",
            toolCalls: [{ id: pendingAction.id, name: pendingAction.toolName, success: execution.result.success, verification: execution.result.verification }],
            ...resourceMetadataFromTool(pendingAction.toolName, execution.result.data),
          });
          return;
        }

        // “아니, 240으로”처럼 조건을 고친 발화는 이전 승인안을 무효화한 뒤 일반 도구 해석으로
        // 넘긴다. 새 조정안이 승인을 요구하면 아래 공통 UI action 수집 과정이 새 pending action을 만든다.
        if (pendingAction && pendingTurn === "correction") {
          pendingAction = transitionPendingAction(pendingAction, "rejected");
          await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId: conversation.id, metadata: { pendingAction } });
          await updateAssistantApprovalBlockState(db, { ownerId: owner.id, conversationId: conversation.id, approvalId: pendingAction.id, state: "cancelled" });
        }

        // 사진 명령은 기존 결정론적 오케스트레이터를 Hermes보다 먼저 실행한다. 복수 폴더,
        // 재시작 확인, 진료과/촬영모드 확인 상태를 그대로 보존하면서 최종 파일 작업은 여전히
        // executeAgentTool()이 기존 remote worker job으로 주문한다.
        if (photoDirectTurn) {
          const directCommand = parsePhotoDirectCommand(rawMessage);
          const photoDirectDeadlineAt = Date.now() + PHOTO_DIRECT_TURN_TIMEOUT_MS;
          const directExecution = await executePhotoDirectTurn({
            enabled: photoDirectExecutionEnabled,
            userMessage: rawMessage,
            hermesToolNames: [],
            pendingState: pendingPhotoDirectExecution,
            context: effectiveContext,
            executeTool: async (name, toolInput, toolContext) => {
              const id = crypto.randomUUID();
              const startedAt = performance.now();
              toolRounds += 1;
              send({ type: "agent_status", status: toolStatus(name) });
              send({ type: "tool_start", tool: name, toolCallId: id });
              const execution = await executePhotoToolBeforeDeadline({
                name,
                deadlineAt: photoDirectDeadlineAt,
                execute: () => executeAgentTool({ id, name, arguments: JSON.stringify(toolInput) }, toolContext),
              });
              toolExecutionMs += performance.now() - startedAt;
              for (const action of execution.uiActions) send({ type: "ui_action", action });
              send({
                type: "tool_result",
                tool: name,
                toolCallId: id,
                success: execution.result.success,
                result: execution.result.success
                  ? execution.result.data || {}
                  : { message: execution.result.error || OLIVIA_FALLBACK_MESSAGES.toolFailureGeneric, code: execution.result.code },
              });
              return { id, execution };
            },
          });

          console.info("[PhotoDirectExecution]", {
            requestId,
            enabled: photoDirectExecutionEnabled,
            guardedTurn: photoDirectTurn,
            handled: directExecution.handled,
            reason: directExecution.reason,
            operation: directCommand?.operation ?? pendingPhotoDirectExecution?.operation ?? null,
            queryCount: directCommand?.folderQueries.length ?? pendingPhotoDirectExecution?.items.length ?? 0,
            candidateCount: directExecution.pendingState?.items[directExecution.pendingState.currentIndex]?.candidates?.length ?? 0,
            pendingStage: directExecution.pendingState?.stage ?? null,
            directToolCalls: directExecution.toolCalls.map((call) => ({ name: call.name, success: call.success, code: call.code })),
            engineRouteReason: engineRoute.reason,
          });

          if (directExecution.handled) {
            const directText = directExecution.text || "사진 작업 요청을 확인했어요.";
            await flushTextAsDeltas(directText, send, messageId);
            await mergeAssistantConversationMetadata(db, {
              ownerId: owner.id,
              conversationId: conversation.id,
              metadata: { pendingPhotoDirectExecution: directExecution.pendingState ?? null },
            });
            chatRouteLabel = "DIRECT_TOOL";
            activeAgentEngine = "legacy";
            console.info(`[CHAT ROUTE] ${chatRouteLabel}`, { requestId, reason: "photo_direct_execution" });
            await saveTurnAssistant(directText, {
              blocks: [{ type: "text", text: directText }],
              agentEngine: "legacy",
              routeDecision: "PHOTO_DIRECT_EXECUTION",
              toolCalls: directExecution.toolCalls.map(({ id, name, success, verification }) => ({ id, name, success, verification })),
            });
            return;
          }
        }

        if (useHermes) {
          send({ type: "agent_status", status: "Olivia가 요청을 확인하는 중…" });
          const hermesRuntime = buildHermesRuntime({
            snapshot: effectiveContext,
            channel: messageChannel,
            today: oliviaRuntime.todayISO,
            message,
            history: historyHint ? [...history, { role: "assistant", content: historyHint }] : history,
            replyContext,
            // taughtMemories는 이미 이번 요청과 관련된 scope(memoryScopes)로만 걸러서 조회했다
            // (getOliviaToolDomains 재사용, 위 Promise.all) — 여기서 다시 필터링하지 않는다.
            memories: taughtMemories.map(toHermesMemoryEntry),
            compactConversationSummary: compactSummary,
          });
          resolvedContextForMessage = hermesRuntime.resolvedContext;
          const hermesContextSnapshot: OliviaContextSnapshot = {
            ...effectiveContext,
            activeClientId: hermesRuntime.context.activeClientId,
            activeProjectId: hermesRuntime.context.activeProjectId,
            activeResourceId: hermesRuntime.context.activeResourceId,
          };
          let hermesStartedOutput = false;
          // 코드 요청서(2026-09-18) 작업 A — client.ts의 guardedResponse와 완전히 동일한 판정을
          // 라우트에서도 미리 계산한다(같은 export 함수 재사용, 새 판정 로직 안 만듦). guarded가
          // 아닌 요청(일반 대화·단순 조회 대부분)은 실시간으로 흘려보낸다 — 완료 주장 위험이
          // 없는 구간이기 때문이다. guarded 요청(검색/수정/UI실행 의도)은 지금처럼 도구 검증이
          // 끝난 뒤 한 번에 보낸다 — client.ts가 371~448행에서 finalText를 검증 결과로 바꿔치기할
          // 수 있어서, 검증 전 원문을 실시간으로 보여주면 안 된다.
          const guardedResponse = photoDirectTurn || isClientSearchRequest(message) || isMutationIntent(message) || isUiExecutionIntent(message);
          const scriptGuard = createStreamingScriptGuard();
          // 실시간으로 이미 내보낸 텍스트를 그대로 누적한다 — 이상 문자가 나중에(sliding-window
          // 밖에서) 발견돼 fallback을 이어붙일 때, DB에 저장되는 텍스트가 실제로 화면에 보인
          // 내용과 정확히 일치하게 하기 위해서다.
          let liveStreamedText = "";
          // hermesText가 hermesResult.text와 우연히 같다는 것만으로 liveStreamedText를 신뢰하면
          // 안 된다 — onTextDelta가 이번 라운드에 단 한 번도 실제 내용으로 호출되지 않았을 수도
          // 있다(예: client.ts 내부 guardedResponse 판정이 달라졌거나, 이 라운드에 델타 자체가
          // 없었던 경우). 이 플래그가 true일 때만 liveStreamedText를 최종 표시 텍스트로 쓴다 —
          // 그렇지 않으면 항상 hermesText(신뢰할 수 있는 원본)를 그대로 flushTextAsDeltas로
          // 보낸다(이번 작업 전과 동일한 안전한 동작으로 자동 폴백).
          let anyLiveDeltaSent = false;
          try {
            const hermesResult = await hermesProvider.chat({
              message,
              history: hermesRuntime.history,
              conversationId: conversation.id,
              context: hermesRuntime.context,
              signal: req.signal,
              callbacks: {
                // guarded가 아닐 때만 실시간으로 흘린다. sliding-window 필터(scriptGuard)를 거쳐
                // 안전하게 확정된 부분만 내보낸다 — 이상 문자는 토큰 경계에서 생기므로 꼬리
                // 구간만 지켜보면 충분하다(lib/olivia/output/scriptSanitizer.ts). 필터가
                // poisoned로 전환되면(이상 문자 발견) 그 이후로는 push()가 항상 ""을 반환해
                // 자동으로 실시간 전송이 멈춘다 — 화면엔 아무것도 안 보인 채로 라운드가 끝나고,
                // 아래(라운드 종료 후)에서 fallback 문구로 이어붙인다.
                onFirstTextDelta: (elapsedMs: number) => {
                  modelFirstTokenMs ??= elapsedMs;
                },
                onTextDelta: guardedResponse ? () => undefined : (delta: string) => {
                  const releasable = scriptGuard.push(delta);
                  if (releasable) {
                    send({ type: "text_delta", messageId, delta: releasable });
                    liveStreamedText += releasable;
                    anyLiveDeltaSent = true;
                  }
                },
                onToolStart: (tool, toolCallId) => {
                  hermesStartedOutput = true;
                  send({ type: "agent_status", status: toolStatus(tool.replace(/^mcp_olivia_/, "")) });
                  send({ type: "tool_start", tool, toolCallId });
                },
                onToolResult: (record) => {
                  hermesStartedOutput = true;
                  send({
                    type: "tool_result",
                    tool: record.name,
                    toolCallId: record.id,
                    success: record.success,
                    result: record.data ?? record.result ?? (record.error ? { success: false, error: record.error, code: record.code } : undefined),
                  });
                },
              },
            });
            // 라운드가 끝났으니 sliding-window 버퍼에 남아있던 마지막 구간을 한 번 더 검사해서
            // 내보낸다(guarded면 애초에 push를 한 번도 안 했으니 flush도 항상 빈 문자열).
            if (!guardedResponse) {
              const tail = scriptGuard.flush();
              if (tail) {
                send({ type: "text_delta", messageId, delta: tail });
                liveStreamedText += tail;
                anyLiveDeltaSent = true;
              }
            }
            // hermesProvider(OliviaBrain)는 현재 "message" variant만 반환한다 — Hermes MCP 루프가
            // Tool 실행까지 자체적으로 끝내고 최종 텍스트를 주기 때문이다(§4/§11). tool_call/plan은
            // 향후 Provider 확장을 위해 타입에만 예약해둔 상태라, 여기서 명시적으로 좁혀 사용한다.
            if (hermesResult.type !== "message") throw new Error("Hermes Brain이 지원하지 않는 응답 형식을 반환했습니다.");

            if (isHermesToolMiss({
              message,
              responseText: hermesResult.text,
              toolCallCount: hermesResult.toolCalls.length,
            })) {
              console.warn("[CHAT ROUTE] HERMES_TOOL_MISS_RETRY", { requestId, requestClass });
              throw new BrainUnavailableError("Hermes가 실행 요청에 필요한 도구를 호출하지 않았습니다.", true);
            }

            const rawResourceMetadata = hermesResult.toolCalls.reduce<Record<string, unknown>>((current, call) => {
              if (!call.success || !call.data || typeof call.data !== "object") return current;
              return { ...current, ...resourceMetadataFromTool(call.name, call.data as Record<string, unknown>, call.resourceType, call.resourceId) };
            }, {});
            const resourceMetadata = resourceSessionMetadata(rawResourceMetadata as Parameters<typeof resourceSessionMetadata>[0]);
            let nextPendingAction: OliviaPendingAction | undefined;
            for (const call of hermesResult.toolCalls) {
              if (!call.success) continue;
              if (call.uiActions?.length) {
                for (const action of call.uiActions) {
                  send({ type: "ui_action", action });
                  nextPendingAction = pendingActionFromUiAction(action, hermesContextSnapshot) || nextPendingAction;
                }
                continue;
              }
              const uiToolName = call.uiToolName || call.name.replace(/^mcp_olivia_/, "").replaceAll(".", "_");
              const uiActions = await resolveUiActions({
                toolCall: { id: call.id, name: uiToolName, arguments: "{}" },
                input: {},
                result: { tool: uiToolName, success: true, data: call.data && typeof call.data === "object" ? call.data as Record<string, unknown> : undefined, verification: call.verification as OliviaToolResult["verification"] },
                context: hermesContextSnapshot,
              });
              for (const action of uiActions) {
                send({ type: "ui_action", action });
                nextPendingAction = pendingActionFromUiAction(action, hermesContextSnapshot) || nextPendingAction;
              }
            }
            const hermesApprovalBlock = pendingActionBlock(nextPendingAction);
            const hermesToolEntries = hermesResult.toolCalls.map((call) => ({
              toolName: call.uiToolName || call.name.replace(/^mcp_olivia_/, "").replaceAll(".", "_"),
              result: {
                tool: call.name,
                success: call.success,
                data: call.data && typeof call.data === "object" ? call.data as Record<string, unknown> : undefined,
                error: call.error,
                verification: call.verification as OliviaToolResult["verification"],
              } satisfies OliviaToolResult,
            }));
            // 코드 요청서(2026-09-18) 작업 B — 쓰기 도구가 실행됐다고 해서 헤르메스가 쓴 문장을
            // 무조건 검증 템플릿으로 바꾸지 않는다. 검증에 실패했을 때만(비-읽기전용 도구가
            // 하나라도 실패) 템플릿으로 완전히 교체하고, 성공했으면 원문은 그대로 두고 "무엇이
            // 저장됐는지" 한 줄만 짧게 덧붙인다. "완료를 주장했는데 실제 실행 기록이 없는" 경우는
            // client.ts의 claimsMutationCompletion/claimsUiExecutionCompletion이 이미
            // hermesResult.text 자체를 안전한 문구로 고쳐서 반환하므로(§건드리지 말 것) 여기서
            // 다시 검사하지 않는다. 우선순위 판단 자체는 lib/olivia/conversation/response.ts의
            // resolveHermesFinalText()로 뽑아 유닛 테스트로 고정했다.
            const nonReadOnlyEntries = hermesToolEntries.filter(({ toolName }) => !isReadOnlyOliviaTool(toolName));
            const { text: hermesText, source: finalTextSource } = resolveHermesFinalText({
              pendingActionPrompt: nextPendingAction?.prompt,
              nonReadOnlyEntries,
              verificationCalls: hermesResult.toolCalls,
              hermesRawText: hermesResult.text,
            });
            // 이 라운드에서 실시간으로 흘려보낸 원문이 최종적으로 쓰이는 텍스트와 정확히
            // 같을 때만(=중간에 pending action/검증 템플릿으로 바뀌지 않았고 + 실제로 뭔가
            // 스트리밍됐을 때만) 재전송을 건너뛴다 — 판단 로직은 실제 E2E 테스트에서 경계
            // 조건이 하나 발견돼(Hermes가 finish_reason:"error"로 빈 응답을 낸 라운드에서,
            // hermesText가 우연히 hermesResult.text와 같아서 빈 liveStreamedText로 실제
            // 응답을 통째로 지워버리는 버그) lib/olivia/output/hermesDisplayText.ts로 뽑아
            // 유닛 테스트로 그 경계를 고정했다. 이상 문자가 중간에 발견됐으면(scriptGuard
            // poisoned) 이미 보인 부분 뒤에 fallback 문구를 이어붙인다 — 같은 mutation 도구를
            // 다시 부르면 중복 실행 위험이 있어 재생성은 하지 않는다(legacy 경로의 재생성과
            // 다른 점, 코드 요청서 작업 A §1).
            const displayResolution = resolveHermesDisplayText({
              guardedResponse,
              anyLiveDeltaSent,
              liveStreamedText,
              hermesText,
              hermesRawText: hermesResult.text,
              scriptGuardPoisoned: scriptGuard.isPoisoned(),
              fallbackMessage: OLIVIA_FALLBACK_MESSAGES.sanitizationFallback,
            });
            if (displayResolution.additionalDeltaToSend) {
              console.error("[olivia-v2] abnormal script detected mid-stream (hermes), appending fallback", { requestId });
              send({ type: "text_delta", messageId, delta: displayResolution.additionalDeltaToSend });
            }
            const finalDisplayText = displayResolution.finalDisplayText;
            const alreadyFullyStreamed = displayResolution.alreadyFullyStreamed;
            // §21 Observability — "왜 이 Tool을 안 썼는가"를 재현 없이 로그만으로 추적할 수 있게
            // 한다. 민감정보(문서 본문/고객 개인정보)는 넣지 않고 이름/개수/id만 남긴다.
            console.info("[HermesTurn]", {
              requestId,
              intent: requestClass,
              agentEngine: "hermes",
              // selectOliviaTools() 값은 legacy OpenAI Responses fallback 전용이다. Hermes MCP는
              // 연결 단위 cache 안전성을 위해 request와 무관한 전체 catalog를 항상 제공한다.
              legacySelectedToolCount: selectedTools.length,
              mcpCatalogMode: "full",
              usage: hermesResult.usage ?? null,
              activeResource: hermesRuntime.context.activeResource,
              resolvedWorkSessionId: hermesRuntime.workSession?.id,
              memoryCount: taughtMemories.length,
              memoryIds: taughtMemories.map((memory) => memory.id),
              historyCount: hermesRuntime.history.length,
              toolCalls: hermesResult.toolCalls.map((call) => ({ name: call.name, success: call.success, mode: call.mode })),
              uiActionCount: hermesResult.toolCalls.reduce((sum, call) => sum + (call.success ? (call.uiActions?.length ?? 0) : 0), 0),
              finalTextSource,
              streamedLive: alreadyFullyStreamed,
            });
            chatRouteLabel = "HERMES";
            console.info(`[CHAT ROUTE] ${chatRouteLabel}`, { requestId });
            if (!alreadyFullyStreamed) {
              await flushTextAsDeltas(finalDisplayText, send, messageId);
            }
            await saveTurnAssistant(finalDisplayText, {
                blocks: [{ type: "text", text: finalDisplayText }, ...(hermesApprovalBlock ? [hermesApprovalBlock] : [])],
                agentEngine: "hermes",
                hermesRunId: hermesResult.runId,
                toolCalls: hermesResult.toolCalls.map(({ id, name, success, mode, resourceType, resourceId, verification }) => ({ id, name, success, mode, resourceType, resourceId, verification })),
                ...resourceMetadata,
            });
            if (nextPendingAction) {
              await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId: conversation.id, metadata: { pendingAction: nextPendingAction } });
            }
            return;
          } catch (hermesError) {
            if (req.signal.aborted || hermesStartedOutput || !isBrainFallbackSafe(hermesError) || !process.env.OPENAI_API_KEY || !model) throw hermesError;
            activeAgentEngine = "legacy";
            chatRouteLabel = "FALLBACK";
            fallbackReason = hermesError instanceof Error ? hermesError.message : "unknown";
            console.warn(`[CHAT ROUTE] ${chatRouteLabel}`, {
              requestId,
              requestedEngine: "hermes",
              actualEngine: "legacy",
              fallbackReason,
            });
            send({ type: "agent_status", status: "클라우드 Olivia로 연결을 전환하는 중…" });
          }
        }

        if (databaseFastPath) {
          const fastText=await resolveDatabaseFastPath(db,message,effectiveContext,oliviaRuntime.todayISO);
          if(fastText){
            send({type:"text_delta",messageId,delta:fastText});
            await saveTurnAssistant(fastText,{blocks:[{type:"text",text:fastText}],routeDecision:"DATABASE_FAST_PATH"});
            return;
          }
        }

        if (persistentAgentRun) {
          const created = await createAgentRun(db, {
            ownerId: owner.id,
            conversationId: conversation.id,
            clientId: effectiveContext.activeClientId,
            workflowRunId: effectiveContext.activeProjectId,
            goal: rawMessage,
            runType: inferPersistentRunType(message),
            source: "chat",
            idempotencyKey: optionalString(body.clientRequestId) || requestId,
            context: effectiveContext as unknown as Record<string, unknown>,
            metadata: { requestClass, pageContext, clientName: effectiveContext.activeClientName || inferPersistentRunClientName(message) },
          });
          const text = created.duplicate ? "이미 접수된 업무예요. Agent Center에서 진행 상황을 이어서 볼 수 있어요." : "업무를 접수했어요. 페이지를 이동하거나 창을 닫아도 계속 진행하며, 승인이 필요하면 멈추고 알려드릴게요.";
          send({ type: "run_created", run: { id: created.run.id, goal: created.run.goal, status: created.run.status, progress: created.run.progress, currentStepKey: created.run.current_step_key || undefined } });
          send({ type: "text_delta", messageId, delta: text });
          await saveTurnAssistant(text, { blocks: [{ type: "text", text }], agentRunId: created.run.id });
          return;
        }

        // ── Deterministic bypass: 오늘/지금 질문이나 고신뢰 화면 이동은 GPT를 거치지 않는다 ──
        if (deterministic) {
          send({ type: "text_delta", messageId, delta: deterministic.text });
          for (const action of deterministic.uiActions) send({ type: "ui_action", action });
          await saveTurnAssistant(deterministic.text, { blocks: [{ type: "text", text: deterministic.text }], routeDecision: deterministic.routeDecision });
          return;
        }

        if (!model) throw new Error("Olivia GPT 모델을 확인해주세요.");

        // [임시 진단] Hermes를 아예 시도하지 않고(useHermes=false) 바로 레거시 GPT로 시작한
        // 경우만 여기서 라벨을 정한다 — 폴백으로 도달했으면 위 catch에서 이미 "FALLBACK"으로
        // 정해져 있으므로 덮어쓰지 않는다.
        if (!chatRouteLabel) {
          chatRouteLabel = "LEGACY_GPT";
          console.info(`[CHAT ROUTE] ${chatRouteLabel}`, { requestId });
        }

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
        const instructions = buildSystemPrompt(oliviaRuntime, compactSummary || summarizeOlderMessages(history), taughtMemories);
        // 서로 무관한 조회 도구들(예: "오늘 일정 보여주고 이번주 미결 견적도 알려줘")을 모델이 한
        // 라운드에 같이 요청할 수 있게 허용한다 — 실제 실행은 아래 for(toolCall of response.toolCalls)
        // 루프가 여전히 순차(await 직렬)로 처리하므로, 같은 라운드에 mutation 도구 2개가 와도
        // 실행 순서 자체는 항상 모델이 나열한 순서 그대로 보장된다(2026-08-15, 코드 요청서 1번 항목).
        let request: StreamingRequest = {
          instructions,
          input: toInputMessages(history, message, effectiveContext, [pageContext, historyHint].filter(Boolean).join("\n\n") || undefined, temporalHint),
          tools: selectedTools,
          parallel_tool_calls: true,
          ...(requiredFollowupTool ? { tool_choice: { type: "function" as const, name: requiredFollowupTool } } : {}),
        };
        let workingContext = effectiveContext;
        let finalText = "";
        let latestResourceMetadata: Record<string, unknown> = {};
        let nextPendingAction: OliviaPendingAction | undefined;
        let hasRenderedVerifiedOutcome = false;
        let deferredFailureText = "";
        const executedToolCalls = new Set<string>();
        const cloudToolCalls: Array<{ id: string; name: string; success: boolean; verification?: OliviaToolResult["verification"] }> = [];

        for (let round = 0; round < maxToolRounds(requestClass); round += 1) {
          toolRounds = round + 1;
          const response = await runRoundWithSanitization({
            openai,
            model,
            request,
            signal: req.signal,
            onFirstToken: () => { if (modelFirstTokenMs === undefined) modelFirstTokenMs = performance.now() - requestStartedAt; },
          });
          if (!response.toolCalls.length) {
            const forcedToolChoice = resolveToollessActionRetry(round, requiredFollowupTool, response.toolCalls.length);
            if (forcedToolChoice) {
              console.warn("[olivia-v2] tool action returned text without execution; forcing one retry", { requestId, requiredFollowupTool });
              send({ type: "agent_status", status: toolStatus(forcedToolChoice.name) });
              request = { ...request, tool_choice: forcedToolChoice };
              continue;
            }
            // 이 라운드엔 tool 호출이 없다 — 앞선 라운드에서 이미 실행·검증된 결과를 보고
            // 모델이 내놓는 최종 텍스트라 검증할 실행이 없다. 지금까지처럼 즉시 흘려보낸다.
            const safeText = hasRenderedVerifiedOutcome
              ? ""
              : requiredFollowupTool && !executedToolCalls.size
              ? "요청을 실행할 도구 결과를 받지 못했어요. 확인되지 않은 성공이나 실패로 답하지 않고 중단했습니다."
              : response.text || deferredFailureText;
            finalText += safeText;
            await flushTextAsDeltas(safeText, send, messageId);
            break;
          }
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
              nextPendingAction = pendingActionFromUiAction(action, workingContext) || nextPendingAction;
              workingContext = updateWorkingContext(workingContext, action);
              console.info("[olivia-v2] ui action", { type: action.type });
            }
            return { execution, toolPayload };
          });
          toolExecutionMs += performance.now() - toolStartedAt;
          for (const { call: toolCall, result: { execution, toolPayload } } of executions) {
            cloudToolCalls.push({ id: toolCall.id, name: toolCall.name, success: execution.result.success, verification: execution.result.verification });
            if (execution.result.success) {
              latestResourceMetadata = {
                ...latestResourceMetadata,
                ...resourceMetadataFromTool(toolCall.name, execution.result.data),
              };
            }
            outputs.push({
              type: "function_call_output",
              call_id: toolCall.id,
              output: JSON.stringify({ success: execution.result.success, ...toolPayload }),
            });
          }

          // 이 라운드는 tool 호출을 동반했다 — response.text는 tool이 실행되기 전에 모델이
          // 만든 텍스트라 "완료했다"는 주장이 섞여 있어도 아직 검증되지 않은 상태였다. 실행이
          // 끝나고 실제 성공/실패를 안 지금에서야 흘려보낸다. 이 라운드의 모든 호출이 견적
          // mutation tool이면 모델의 자유 텍스트 대신 서버가 이미 계산해 둔 결정론적 확인
          // 문구(성공은 data.summary, 실패는 result.error)로 통째로 교체한다.
          const quoteConfirmation = buildQuoteRoundConfirmation(
            executions.map(({ call, result: { execution } }) => ({ toolName: call.name, result: execution.result }))
          );
          // 계약 mutation 라운드도 같은 원칙(PHASE 3, 2026-08-30) — 견적 라운드가 아닐 때만 확인.
          const contractConfirmation = quoteConfirmation ? null : buildContractRoundConfirmation(
            executions.map(({ call, result: { execution } }) => ({ toolName: call.name, result: execution.result }))
          );
          const generalConfirmation = quoteConfirmation || contractConfirmation || executions.some(({ call }) => isReadOnlyOliviaTool(call.name))
            ? null
            : renderVerifiedToolRound(executions.map(({ result: { execution } }) => ({ result: execution.result })));
          const verifiedRoundText = nextPendingAction?.prompt ?? quoteConfirmation ?? contractConfirmation ?? generalConfirmation;
          const roundText = verifiedRoundText ?? response.text;
          const roundOnlyFailed = executions.length > 0
            && executions.every(({ result: { execution } }) => !execution.result.success);
          // 모델이 잘못 채운 선택 인자 때문에 첫 호출이 실패한 뒤, 다음 라운드에서 스스로
          // 고쳐 재시도하는 경우가 있다. 이 중간 실패를 즉시 사용자에게 보내면 최종 성공 문구와
          // 붙어서 "실패했습니다...저장했어요"처럼 모순된 답이 된다. 마지막 기회까지 잠시
          // 보류하고, 뒤 라운드가 성공하면 버린다. 끝까지 실패할 때만 실제 오류를 보여준다.
          if (roundOnlyFailed && !nextPendingAction && round + 1 < maxToolRounds(requestClass)) {
            deferredFailureText = roundText;
            request = {
              instructions,
              previous_response_id: response.responseId,
              input: outputs,
              tools: selectedTools,
              parallel_tool_calls: true,
            };
            continue;
          }
          if (executions.some(({ result: { execution } }) => execution.result.success)) {
            deferredFailureText = "";
          }
          if (verifiedRoundText) hasRenderedVerifiedOutcome = true;
          finalText += roundText;
          await flushTextAsDeltas(roundText, send, messageId);

          send({ type: "agent_status", status: "결과를 정리하는 중…" });
          if (nextPendingAction) break;
          request = {
            instructions,
            previous_response_id: response.responseId,
            input: outputs,
            tools: selectedTools,
            parallel_tool_calls: true,
          };
        }

        if (!finalText.trim()) finalText = deferredFailureText || OLIVIA_FALLBACK_MESSAGES.emptyResponseFallback;
        const approvalBlock = pendingActionBlock(nextPendingAction);
        await saveTurnAssistant(finalText, { blocks: [{ type: "text", text: finalText }, ...(approvalBlock ? [approvalBlock] : [])], model, agentEngine: "cloud", requestClass, toolCalls: cloudToolCalls, ...latestResourceMetadata });
        if (nextPendingAction) {
          await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId: conversation.id, metadata: { pendingAction: nextPendingAction } });
        }
        const summaryLines=history.slice(-12).concat([{role:"assistant",content:finalText} as ConversationMessage])
          .map((row)=>`${row.role}: ${String(row.content||"").replace(/\s+/g," ").slice(0,180)}`);
        const nextSummary=[compactSummary,...summaryLines].filter(Boolean).join("\n").slice(-4000);
        await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId: conversation.id, metadata: { compactSummary: nextSummary, summaryCursor: new Date().toISOString() } });
      } catch (error) {
        if (req.signal.aborted) {
          console.info("[olivia-v2] response cancelled");
        } else {
          console.error("[olivia-v2] stream failed", error);
          send({
            type: "error",
            message: activeAgentEngine === "hermes" && error instanceof Error
              ? error.message
              : OLIVIA_FALLBACK_MESSAGES.streamFailure,
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
          model: activeAgentEngine === "hermes"
            ? "hermes-agent"
            : deterministic || persistentAgentRun || chatRouteLabel === "DIRECT_TOOL"
              ? null
              : model,
          agentEngine: activeAgentEngine,
          // 요청된 기본 엔진과 실제 라우팅 결과를 함께 남긴다. 둘이 달라도 직접 실행 우회라면
          // 정상 동작이며, 실제 Hermes 장애 폴백일 때만 fallbackReason이 채워진다.
          requestedEngine: engineRoute.requestedEngine,
          actualEngine: activeAgentEngine,
          directToolExecutionEnabled: engineRoute.directToolExecutionEnabled,
          engineRouteReason: engineRoute.reason,
          ...(fallbackReason ? { fallbackReason } : {}),
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
