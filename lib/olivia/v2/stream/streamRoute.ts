import { NextRequest } from "next/server";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
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
import type { OliviaAgentToolExecution, OliviaContextSnapshot, OliviaStreamEvent, OliviaToolCall, OliviaToolResult } from "@/lib/olivia/v2/types";
import { buildOliviaRuntimeContext } from "@/lib/olivia/runtime/buildRuntimeContext";
import { resolveTemporalExpression } from "@/lib/olivia/runtime/temporalResolver";
import { resolveDeterministicResponse } from "@/lib/olivia/orchestrator/handleRequest";
import { classifyRequestKind } from "@/lib/olivia/orchestrator/classifyRequest";
import { applyAliasRewrite } from "@/lib/olivia/intelligence/aliasResolver";
import { applyReferentRewrite } from "@/lib/olivia/intelligence/referentResolver";
import { buildCanonicalRecentUserText, buildLastActionFollowupHint, getOliviaToolDomains, isReadOnlyOliviaTool, resolveRequiredFollowupTool, resolveToollessActionRetry, restoreDocumentContextFromHistory, selectOliviaTools } from "@/lib/olivia/v2/toolSelection";
import { listActiveMemories } from "@/lib/olivia/memory/repository";
import { toHermesMemoryEntry } from "@/lib/olivia/memory/format";
import { executeOliviaToolBatch } from "@/lib/olivia/v2/toolScheduler";
import { inferPersistentRunClientName, inferPersistentRunType, shouldCreatePersistentAgentRun } from "@/lib/olivia/v2/persistentRunClassifier";
import { createAgentRun } from "@/lib/olivia/agentRuns/service";
import { hasDatabaseFastPath, resolveDatabaseFastPath } from "@/lib/olivia/v2/databaseFastPath";
import { createStreamingScriptGuard } from "@/lib/olivia/output/scriptSanitizer";
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
import {
  clientTargetQuestion,
  resolveTrustedClientProjectContext,
  shouldRequireClientSelection,
} from "@/lib/core/context/clientTarget";
import { buildAssistantEngineMetadata } from "@/lib/olivia/v2/fallbackMetadata";
import { handlePendingActionTurn } from "@/lib/olivia/v2/stream/pendingAction";
import { runHermesTurn, type ChatRouteLabel } from "@/lib/olivia/v2/stream/hermesTurn";
import { runLegacyTurn } from "@/lib/olivia/v2/stream/legacyTurn";

function encodeEvent(event: OliviaStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function isInternalServerRequest(req: NextRequest): boolean {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return false;
  return req.headers.get("x-internal-key") === key;
}

export async function handleOliviaStreamPost(req: NextRequest) {
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
      let chatRouteLabel: ChatRouteLabel | undefined;
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
        // 자동으로 agentEngine/fallbackReason을 DB metadata와 SSE 이벤트 둘 다에 싣는다.
        // 호출부의 오래된 "cloud" 같은 표기가 실제 route 판정을 덮어쓰지 못하게 여기서 강제한다.
        const saveTurnAssistant = async (content: string, metadata: Record<string, unknown>) => {
          const enrichedMetadata = buildAssistantEngineMetadata(metadata, {
            agentEngine: activeAgentEngine,
            fallbackReason,
          });
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
        const trustedClientProject = resolveTrustedClientProjectContext({
          message,
          // restoreDocumentContextFromHistory()가 복구한 오래된 문서 고객은 실행 대상의 근거로
          // 쓰지 않는다. 현재 화면 snapshot과 명시 reply context만 신뢰한다.
          snapshot: context,
          explicit: {
            clientId: replyClientId,
            clientName: replyClientName,
            projectId: replyProjectId,
            projectName: replyProjectName,
          },
        });
        if (shouldRequireClientSelection({ message, resolved: trustedClientProject })) {
          const text = clientTargetQuestion(context, "작업");
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
            activeClientId: trustedClientProject.clientId,
            activeClientName: trustedClientProject.clientName,
            activeProjectId: trustedClientProject.projectId,
            activeProjectName: trustedClientProject.projectName,
          };
          resolvedContextForMessage = {
            clientId: effectiveContext.activeClientId,
            clientName: effectiveContext.activeClientName,
            projectId: effectiveContext.activeProjectId,
            projectName: effectiveContext.activeProjectName,
          };
        }

        // 승인을 기다리는 짧은 답은 저장된 tool/input으로 결정론적으로 처리한다.
        const pendingResult = await handlePendingActionTurn({
          db,
          ownerId: owner.id,
          conversationId: conversation.id,
          pendingAction,
          pendingTurn,
          effectiveContext,
          messageId,
          send,
          saveTurnAssistant,
        });
        pendingAction = pendingResult.pendingAction;
        if (pendingResult.handled) return;

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
          const hermesTurn = await runHermesTurn({
            db,
            ownerId: owner.id,
            conversationId: conversation.id,
            effectiveContext,
            messageChannel,
            today: oliviaRuntime.todayISO,
            message,
            history,
            historyHint,
            replyContext,
            taughtMemories,
            compactSummary,
            photoDirectTurn,
            requestId,
            requestClass,
            selectedToolCount: selectedTools.length,
            signal: req.signal,
            legacyModel: model,
            messageId,
            send,
            saveTurnAssistant,
            onRouteState: (state) => {
              activeAgentEngine = state.activeAgentEngine;
              chatRouteLabel = state.chatRouteLabel;
              fallbackReason = state.fallbackReason;
            },
            onResolvedContext: (resolved) => {
              resolvedContextForMessage = {
                clientId: resolved.clientId,
                clientName: resolved.clientName,
                projectId: resolved.projectId,
                projectName: resolved.projectName,
              };
            },
            onFirstToken: (elapsedMs) => { modelFirstTokenMs ??= elapsedMs; },
          });
          if (hermesTurn.handled) return;
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

        await runLegacyTurn({
          db,
          ownerId: owner.id,
          conversationId: conversation.id,
          model,
          requestClass,
          runtime: oliviaRuntime,
          message,
          effectiveContext,
          history,
          pageContext,
          historyHint,
          compactSummary,
          taughtMemories,
          selectedTools,
          requiredFollowupTool,
          requestId,
          signal: req.signal,
          messageId,
          send,
          saveTurnAssistant,
          onFirstToken: () => {
            if (modelFirstTokenMs === undefined) modelFirstTokenMs = performance.now() - requestStartedAt;
          },
          onToolRound: (rounds) => { toolRounds = rounds; },
          onToolExecution: (elapsedMs) => { toolExecutionMs += elapsedMs; },
        });
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
