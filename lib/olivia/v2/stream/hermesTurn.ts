import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantChannel } from "@/lib/assistant/types";
import { BrainUnavailableError, hermesProvider, isBrainFallbackSafe } from "@/lib/assistant/brain";
import { mergeAssistantConversationMetadata } from "@/lib/assistant/conversations/service";
import { buildHermesRuntime, resourceSessionMetadata } from "@/lib/hermes/runtimeContext";
import { isClientSearchRequest, isMutationIntent, isUiExecutionIntent } from "@/lib/hermes/client";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import {
  pendingActionBlock,
  pendingActionFromUiAction,
  type OliviaPendingAction,
} from "@/lib/olivia/conversation/dialogueState";
import { resolveHermesFinalText } from "@/lib/olivia/conversation/response";
import type { listActiveMemories } from "@/lib/olivia/memory/repository";
import { toHermesMemoryEntry } from "@/lib/olivia/memory/format";
import { resolveHermesDisplayText } from "@/lib/olivia/output/hermesDisplayText";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import { createStreamingScriptGuard } from "@/lib/olivia/output/scriptSanitizer";
import { isHermesToolMiss } from "@/lib/olivia/v2/executionIntent";
import type { OliviaContextSnapshot, OliviaStreamEvent, OliviaToolResult } from "@/lib/olivia/v2/types";
import type { ConversationMessage } from "@/lib/olivia/v2/stream/contextPrompt";
import { resourceMetadataFromTool } from "@/lib/olivia/v2/stream/resourceMetadata";
import { flushTextAsDeltas } from "@/lib/olivia/v2/stream/scriptGuard";
import { toolStatus } from "@/lib/olivia/v2/stream/toolStatusLabels";
import { isReadOnlyOliviaTool } from "@/lib/olivia/v2/toolSelection";

export type ChatRouteLabel = "HERMES" | "FALLBACK" | "LEGACY_GPT" | "DIRECT_TOOL";

type HermesTurnInput = {
  db: SupabaseClient;
  ownerId: string;
  conversationId: string;
  effectiveContext: OliviaContextSnapshot;
  messageChannel: AssistantChannel;
  today: string;
  message: string;
  history: ConversationMessage[];
  historyHint?: string;
  replyContext?: Record<string, unknown>;
  taughtMemories: Awaited<ReturnType<typeof listActiveMemories>>;
  compactSummary?: string;
  photoDirectTurn: boolean;
  requestId: string;
  requestClass: string;
  selectedToolCount: number;
  signal: AbortSignal;
  legacyModel?: string | null;
  messageId: string;
  send: (event: OliviaStreamEvent) => void;
  saveTurnAssistant: (content: string, metadata: Record<string, unknown>) => Promise<unknown>;
  onRouteState: (state: {
    activeAgentEngine: "hermes" | "legacy";
    chatRouteLabel: ChatRouteLabel;
    fallbackReason?: string;
  }) => void;
  onResolvedContext: (context: {
    clientId?: string;
    clientName?: string;
    projectId?: string;
    projectName?: string;
  }) => void;
  onFirstToken: (elapsedMs: number) => void;
};

export type HermesTurnResult = {
  handled: boolean;
  fallbackReason?: string;
};

/** Runs the complete Hermes/MCP turn and returns only when a legacy fallback is required. */
export async function runHermesTurn(input: HermesTurnInput): Promise<HermesTurnResult> {
  const {
    db,
    ownerId,
    conversationId,
    effectiveContext,
    messageChannel,
    today,
    message,
    history,
    historyHint,
    replyContext,
    taughtMemories,
    compactSummary,
    photoDirectTurn,
    requestId,
    requestClass,
    selectedToolCount,
    signal,
    legacyModel,
    messageId,
    send,
    saveTurnAssistant,
    onRouteState,
    onResolvedContext,
    onFirstToken,
  } = input;

  send({ type: "agent_status", status: "Olivia가 요청을 확인하는 중…" });
  const hermesRuntime = buildHermesRuntime({
    snapshot: effectiveContext,
    channel: messageChannel,
    today,
    message,
    history: historyHint ? [...history, { role: "assistant", content: historyHint }] : history,
    replyContext,
    memories: taughtMemories.map(toHermesMemoryEntry),
    compactConversationSummary: compactSummary,
  });
  onResolvedContext(hermesRuntime.resolvedContext);
  const hermesContextSnapshot: OliviaContextSnapshot = {
    ...effectiveContext,
    activeClientId: hermesRuntime.context.activeClientId,
    activeProjectId: hermesRuntime.context.activeProjectId,
    activeResourceId: hermesRuntime.context.activeResourceId,
  };
  let hermesStartedOutput = false;
  const guardedResponse = photoDirectTurn
    || isClientSearchRequest(message)
    || isMutationIntent(message)
    || isUiExecutionIntent(message);
  const scriptGuard = createStreamingScriptGuard();
  let liveStreamedText = "";
  let anyLiveDeltaSent = false;

  try {
    const hermesResult = await hermesProvider.chat({
      message,
      history: hermesRuntime.history,
      conversationId,
      context: hermesRuntime.context,
      signal,
      callbacks: {
        onFirstTextDelta: onFirstToken,
        onTextDelta: guardedResponse ? () => undefined : (delta: string) => {
          const releasable = scriptGuard.push(delta);
          if (!releasable) return;
          send({ type: "text_delta", messageId, delta: releasable });
          liveStreamedText += releasable;
          anyLiveDeltaSent = true;
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
            result: record.data ?? record.result
              ?? (record.error ? { success: false, error: record.error, code: record.code } : undefined),
          });
        },
      },
    });

    if (!guardedResponse) {
      const tail = scriptGuard.flush();
      if (tail) {
        send({ type: "text_delta", messageId, delta: tail });
        liveStreamedText += tail;
        anyLiveDeltaSent = true;
      }
    }
    if (hermesResult.type !== "message") {
      throw new Error("Hermes Brain이 지원하지 않는 응답 형식을 반환했습니다.");
    }
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
      return {
        ...current,
        ...resourceMetadataFromTool(
          call.name,
          call.data as Record<string, unknown>,
          call.resourceType,
          call.resourceId,
        ),
      };
    }, {});
    const resourceMetadata = resourceSessionMetadata(
      rawResourceMetadata as Parameters<typeof resourceSessionMetadata>[0],
    );
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
        result: {
          tool: uiToolName,
          success: true,
          data: call.data && typeof call.data === "object"
            ? call.data as Record<string, unknown>
            : undefined,
          verification: call.verification as OliviaToolResult["verification"],
        },
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
        data: call.data && typeof call.data === "object"
          ? call.data as Record<string, unknown>
          : undefined,
        error: call.error,
        verification: call.verification as OliviaToolResult["verification"],
      } satisfies OliviaToolResult,
    }));
    const nonReadOnlyEntries = hermesToolEntries.filter(
      ({ toolName }) => !isReadOnlyOliviaTool(toolName),
    );
    const { text: hermesText, source: finalTextSource } = resolveHermesFinalText({
      pendingActionPrompt: nextPendingAction?.prompt,
      nonReadOnlyEntries,
      verificationCalls: hermesResult.toolCalls,
      hermesRawText: hermesResult.text,
    });
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
    console.info("[HermesTurn]", {
      requestId,
      intent: requestClass,
      agentEngine: "hermes",
      legacySelectedToolCount: selectedToolCount,
      mcpCatalogMode: "full",
      usage: hermesResult.usage ?? null,
      activeResource: hermesRuntime.context.activeResource,
      resolvedWorkSessionId: hermesRuntime.workSession?.id,
      memoryCount: taughtMemories.length,
      memoryIds: taughtMemories.map((memory) => memory.id),
      historyCount: hermesRuntime.history.length,
      toolCalls: hermesResult.toolCalls.map((call) => ({
        name: call.name,
        success: call.success,
        mode: call.mode,
      })),
      uiActionCount: hermesResult.toolCalls.reduce(
        (sum, call) => sum + (call.success ? (call.uiActions?.length ?? 0) : 0),
        0,
      ),
      finalTextSource,
      streamedLive: alreadyFullyStreamed,
    });
    onRouteState({ activeAgentEngine: "hermes", chatRouteLabel: "HERMES" });
    console.info("[CHAT ROUTE] HERMES", { requestId });
    if (!alreadyFullyStreamed) await flushTextAsDeltas(finalDisplayText, send, messageId);
    await saveTurnAssistant(finalDisplayText, {
      blocks: [
        { type: "text", text: finalDisplayText },
        ...(hermesApprovalBlock ? [hermesApprovalBlock] : []),
      ],
      agentEngine: "hermes",
      hermesRunId: hermesResult.runId,
      toolCalls: hermesResult.toolCalls.map(({
        id, name, success, mode, resourceType, resourceId, verification,
      }) => ({ id, name, success, mode, resourceType, resourceId, verification })),
      ...resourceMetadata,
    });
    if (nextPendingAction) {
      await mergeAssistantConversationMetadata(db, {
        ownerId,
        conversationId,
        metadata: { pendingAction: nextPendingAction },
      });
    }
    return { handled: true };
  } catch (hermesError) {
    if (
      signal.aborted
      || hermesStartedOutput
      || !isBrainFallbackSafe(hermesError)
      || !process.env.OPENAI_API_KEY
      || !legacyModel
    ) {
      throw hermesError;
    }
    const fallbackReason = hermesError instanceof Error ? hermesError.message : "unknown";
    onRouteState({
      activeAgentEngine: "legacy",
      chatRouteLabel: "FALLBACK",
      fallbackReason,
    });
    console.warn("[CHAT ROUTE] FALLBACK", {
      requestId,
      requestedEngine: "hermes",
      actualEngine: "legacy",
      fallbackReason,
    });
    send({ type: "agent_status", status: "클라우드 Olivia로 연결을 전환하는 중…" });
    return { handled: false, fallbackReason };
  }
}
