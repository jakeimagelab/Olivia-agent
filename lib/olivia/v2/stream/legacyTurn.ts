import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeAssistantConversationMetadata } from "@/lib/assistant/conversations/service";
import {
  pendingActionBlock,
  pendingActionFromUiAction,
  type OliviaPendingAction,
} from "@/lib/olivia/conversation/dialogueState";
import { renderVerifiedToolRound } from "@/lib/olivia/conversation/response";
import type { listActiveMemories } from "@/lib/olivia/memory/repository";
import { resolveTemporalExpression } from "@/lib/olivia/runtime/temporalResolver";
import type { buildOliviaRuntimeContext } from "@/lib/olivia/runtime/buildRuntimeContext";
import { buildContractRoundConfirmation } from "@/lib/olivia/output/contractConfirmations";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import { buildQuoteRoundConfirmation } from "@/lib/olivia/output/quoteConfirmations";
import { executeOliviaToolBatch } from "@/lib/olivia/v2/toolScheduler";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type {
  OliviaContextSnapshot,
  OliviaStreamEvent,
  OliviaToolCall,
  OliviaToolResult,
} from "@/lib/olivia/v2/types";
import type { classifyOliviaRequest } from "@/lib/olivia/v2/modelRouter";
import {
  isRequiredToolChoiceCompatible,
  isReadOnlyOliviaTool,
  resolveToollessActionRetry,
  type selectOliviaTools,
} from "@/lib/olivia/v2/toolSelection";
import {
  summarizeOlderMessages,
  toInputMessages,
  updateWorkingContext,
  type ConversationMessage,
} from "@/lib/olivia/v2/stream/contextPrompt";
import { resourceMetadataFromTool } from "@/lib/olivia/v2/stream/resourceMetadata";
import {
  flushTextAsDeltas,
  runRoundWithSanitization,
  type StreamingRequest,
} from "@/lib/olivia/v2/stream/scriptGuard";
import { buildSystemPrompt } from "@/lib/olivia/v2/stream/systemPrompt";
import { toolStatus } from "@/lib/olivia/v2/stream/toolStatusLabels";
import { maxToolRounds } from "@/lib/olivia/v2/stream/turnLimits";
import { isToolExecutionMiss } from "@/lib/olivia/v2/executionIntent";
import { enforceCompletionClaims } from "@/lib/olivia/v2/completionClaimGuard";

type LegacyTurnInput = {
  db: SupabaseClient;
  ownerId: string;
  conversationId: string;
  model: string;
  requestClass: ReturnType<typeof classifyOliviaRequest>;
  runtime: ReturnType<typeof buildOliviaRuntimeContext>;
  message: string;
  effectiveContext: OliviaContextSnapshot;
  history: ConversationMessage[];
  pageContext?: string;
  historyHint?: string;
  compactSummary?: string;
  taughtMemories: Awaited<ReturnType<typeof listActiveMemories>>;
  selectedTools: ReturnType<typeof selectOliviaTools>;
  requiredFollowupTool?: string;
  requestId: string;
  signal: AbortSignal;
  messageId: string;
  send: (event: OliviaStreamEvent) => void;
  saveTurnAssistant: (content: string, metadata: Record<string, unknown>) => Promise<unknown>;
  onFirstToken: () => void;
  onToolRound: (rounds: number) => void;
  onToolExecution: (elapsedMs: number) => void;
};

/** Runs the complete legacy OpenAI Responses tool loop. */
export async function runLegacyTurn({
  db,
  ownerId,
  conversationId,
  model,
  requestClass,
  runtime,
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
  signal,
  messageId,
  send,
  saveTurnAssistant,
  onFirstToken,
  onToolRound,
  onToolExecution,
}: LegacyTurnInput) {
  send({ type: "agent_status", status: "요청을 이해하는 중…" });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const temporal = resolveTemporalExpression(message, runtime);
  const temporalHint = temporal
    ? temporal.kind === "date"
      ? `${temporal.label} = ${temporal.date}`
      : `${temporal.label} = ${temporal.start} ~ ${temporal.end}`
    : undefined;
  const instructions = buildSystemPrompt(
    runtime,
    compactSummary || summarizeOlderMessages(history),
    taughtMemories,
  );
  const safeRequiredFollowupTool = isRequiredToolChoiceCompatible(message, requiredFollowupTool)
    ? requiredFollowupTool
    : undefined;
  let request: StreamingRequest = {
    instructions,
    input: toInputMessages(
      history,
      message,
      effectiveContext,
      [pageContext, historyHint].filter(Boolean).join("\n\n") || undefined,
      temporalHint,
    ),
    tools: selectedTools,
    parallel_tool_calls: true,
    ...(safeRequiredFollowupTool
      ? { tool_choice: { type: "function" as const, name: safeRequiredFollowupTool } }
      : {}),
  };
  let workingContext = effectiveContext;
  let finalText = "";
  let latestResourceMetadata: Record<string, unknown> = {};
  let nextPendingAction: OliviaPendingAction | undefined;
  let hasRenderedVerifiedOutcome = false;
  let deferredFailureText = "";
  const executedToolCalls = new Set<string>();
  const cloudToolCalls: Array<{
    id: string;
    name: string;
    success: boolean;
    verification?: OliviaToolResult["verification"];
  }> = [];
  const guardCompletionText = (text: string, round: number | "final") => {
    const guarded = enforceCompletionClaims({ text, executedTools: cloudToolCalls });
    if (guarded.unsupported.length) {
      console.warn("[olivia/completion-claim] 근거 없는 완료 주장을 차단했습니다", {
        conversationId,
        round,
        unsupported: guarded.unsupported,
        executedTools: cloudToolCalls.map((call) => `${call.name}(${call.success ? "성공" : "실패"})`),
      });
    }
    return guarded.text;
  };

  for (let round = 0; round < maxToolRounds(requestClass); round += 1) {
    onToolRound(round + 1);
    const response = await runRoundWithSanitization({
      openai,
      model,
      request,
      signal,
      onFirstToken,
    });
    if (!response.toolCalls.length) {
      const executionMiss = isToolExecutionMiss({
        message,
        responseText: response.text,
        toolCallCount: executedToolCalls.size,
      });
      const requiredToolChoice = resolveToollessActionRetry(
        round,
        safeRequiredFollowupTool,
        executedToolCalls.size,
      );
      const forcedToolChoice = requiredToolChoice
        ?? (executionMiss && round === 0 && executedToolCalls.size === 0 ? "required" as const : undefined);
      if (forcedToolChoice) {
        console.warn("[olivia-v2] tool action returned text without execution; forcing one retry", {
          requestId,
          requiredFollowupTool: safeRequiredFollowupTool,
        });
        send({
          type: "agent_status",
          status: typeof forcedToolChoice === "string"
            ? "실행 도구를 다시 확인하는 중…"
            : toolStatus(forcedToolChoice.name),
        });
        request = { ...request, tool_choice: forcedToolChoice };
        continue;
      }
      const stoppedExecutionMiss = executionMiss && executedToolCalls.size === 0;
      const safeText = hasRenderedVerifiedOutcome
        ? ""
        : (safeRequiredFollowupTool && !executedToolCalls.size) || stoppedExecutionMiss
          ? "요청을 실행하지 못했습니다. 도구를 호출하지 못해서 아무 작업도 하지 않았습니다."
          : response.text || deferredFailureText;
      const guardedText = guardCompletionText(safeText, round);
      finalText += guardedText;
      await flushTextAsDeltas(guardedText, send, messageId);
      break;
    }
    if (!response.responseId) throw new Error("OpenAI tool response ID가 없습니다.");

    const outputs: ResponseInputItem[] = [];
    const uniqueCalls: OliviaToolCall[] = [];
    for (const toolCall of response.toolCalls) {
      const signature = `${toolCall.name}:${toolCall.arguments}`;
      if (executedToolCalls.has(signature)) {
        outputs.push({
          type: "function_call_output",
          call_id: toolCall.id,
          output: JSON.stringify({ success: false, message: OLIVIA_FALLBACK_MESSAGES.duplicateToolCall }),
        });
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
      console.info("[olivia-v2] tool result", {
        tool: toolCall.name,
        success: execution.result.success,
      });
      for (const action of execution.uiActions) {
        send({ type: "ui_action", action });
        nextPendingAction = pendingActionFromUiAction(action, workingContext) || nextPendingAction;
        workingContext = updateWorkingContext(workingContext, action);
        console.info("[olivia-v2] ui action", { type: action.type });
      }
      return { execution, toolPayload };
    });
    onToolExecution(performance.now() - toolStartedAt);
    for (const { call: toolCall, result: { execution, toolPayload } } of executions) {
      cloudToolCalls.push({
        id: toolCall.id,
        name: toolCall.name,
        success: execution.result.success,
        verification: execution.result.verification,
      });
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

    const quoteConfirmation = buildQuoteRoundConfirmation(
      executions.map(({ call, result: { execution } }) => ({
        toolName: call.name,
        result: execution.result,
      })),
    );
    const contractConfirmation = quoteConfirmation ? null : buildContractRoundConfirmation(
      executions.map(({ call, result: { execution } }) => ({
        toolName: call.name,
        result: execution.result,
      })),
    );
    const generalConfirmation = quoteConfirmation
      || contractConfirmation
      || executions.some(({ call }) => isReadOnlyOliviaTool(call.name))
      ? null
      : renderVerifiedToolRound(
        executions.map(({ result: { execution } }) => ({ result: execution.result })),
      );
    const verifiedRoundText = nextPendingAction?.prompt
      ?? quoteConfirmation
      ?? contractConfirmation
      ?? generalConfirmation;
    const roundText = verifiedRoundText ?? response.text;
    const roundOnlyFailed = executions.length > 0
      && executions.every(({ result: { execution } }) => !execution.result.success);
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
    const guardedRoundText = guardCompletionText(roundText, round);
    finalText += guardedRoundText;
    await flushTextAsDeltas(guardedRoundText, send, messageId);
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

  if (!finalText.trim()) {
    finalText = deferredFailureText || OLIVIA_FALLBACK_MESSAGES.emptyResponseFallback;
  }
  // 스트리밍 전 모든 라운드에 가드를 적용하지만, 향후 분기에서 finalText를 합치는 코드가
  // 추가되어도 저장된 대화 기록에 근거 없는 완료 주장이 남지 않도록 마지막에 다시 검증한다.
  finalText = guardCompletionText(finalText, "final");
  const approvalBlock = pendingActionBlock(nextPendingAction);
  await saveTurnAssistant(finalText, {
    blocks: [{ type: "text", text: finalText }, ...(approvalBlock ? [approvalBlock] : [])],
    model,
    requestClass,
    toolCalls: cloudToolCalls,
    ...latestResourceMetadata,
  });
  if (nextPendingAction) {
    await mergeAssistantConversationMetadata(db, {
      ownerId,
      conversationId,
      metadata: { pendingAction: nextPendingAction },
    });
  }
  const summaryLines = history.slice(-12)
    .concat([{ role: "assistant", content: finalText } as ConversationMessage])
    .map((row) => `${row.role}: ${String(row.content || "").replace(/\s+/g, " ").slice(0, 180)}`);
  const nextSummary = [compactSummary, ...summaryLines].filter(Boolean).join("\n").slice(-4000);
  await mergeAssistantConversationMetadata(db, {
    ownerId,
    conversationId,
    metadata: { compactSummary: nextSummary, summaryCursor: new Date().toISOString() },
  });
}
