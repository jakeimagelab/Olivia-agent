import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeAssistantConversationMetadata,
  updateAssistantApprovalBlockState,
} from "@/lib/assistant/conversations/service";
import {
  pendingActionBlock,
  pendingActionFromUiAction,
  resolvePendingActionContext,
  transitionPendingAction,
  type OliviaPendingAction,
  type PendingActionTurn,
} from "@/lib/olivia/conversation/dialogueState";
import { renderOliviaOutcome, toolResultOutcome } from "@/lib/olivia/conversation/response";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot, OliviaStreamEvent } from "@/lib/olivia/v2/types";
import { resourceMetadataFromTool } from "@/lib/olivia/v2/stream/resourceMetadata";
import { toolStatus } from "@/lib/olivia/v2/stream/toolStatusLabels";
import { updateWorkingContext } from "@/lib/olivia/v2/stream/contextPrompt";

type PendingActionTurnInput = {
  db: SupabaseClient;
  ownerId: string;
  conversationId: string;
  pendingAction?: OliviaPendingAction;
  pendingTurn: PendingActionTurn;
  effectiveContext: OliviaContextSnapshot;
  messageId: string;
  send: (event: OliviaStreamEvent) => void;
  saveTurnAssistant: (content: string, metadata: Record<string, unknown>) => Promise<unknown>;
};

export type PendingActionTurnResult = {
  handled: boolean;
  pendingAction?: OliviaPendingAction;
};

/** Executes an existing approval without sending it back through Hermes/OpenAI. */
export async function handlePendingActionTurn({
  db,
  ownerId,
  conversationId,
  pendingAction,
  pendingTurn,
  effectiveContext,
  messageId,
  send,
  saveTurnAssistant,
}: PendingActionTurnInput): Promise<PendingActionTurnResult> {
  if (!pendingAction || pendingTurn === "none") return { handled: false, pendingAction };

  if (pendingTurn === "correction") {
    const rejected = transitionPendingAction(pendingAction, "rejected");
    await mergeAssistantConversationMetadata(db, {
      ownerId,
      conversationId,
      metadata: { pendingAction: rejected },
    });
    await updateAssistantApprovalBlockState(db, {
      ownerId,
      conversationId,
      approvalId: rejected.id,
      state: "cancelled",
    });
    return { handled: false, pendingAction: rejected };
  }

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
      toolCall = {
        id: `${pendingAction.id}:defer`,
        name: "defer_temporary_document",
        success: deferred.result.success,
        verification: deferred.result.verification,
      };
      text = renderOliviaOutcome(toolResultOutcome(deferred.result, pendingAction));
    }
    const resolved = transitionPendingAction(
      pendingAction,
      pendingTurn === "defer" ? "deferred" : "rejected",
    );
    await mergeAssistantConversationMetadata(db, { ownerId, conversationId, metadata: { pendingAction: resolved } });
    await updateAssistantApprovalBlockState(db, {
      ownerId,
      conversationId,
      approvalId: resolved.id,
      state: "cancelled",
    });
    send({ type: "text_delta", messageId, delta: text });
    await saveTurnAssistant(text, {
      blocks: [{ type: "text", text }],
      dialogueResolution: pendingTurn,
      ...(toolCall ? { toolCalls: [toolCall] } : {}),
    });
    return { handled: true, pendingAction: resolved };
  }

  const approved = transitionPendingAction(pendingAction, "approved");
  await mergeAssistantConversationMetadata(db, { ownerId, conversationId, metadata: { pendingAction: approved } });
  const pendingContext = resolvePendingActionContext(effectiveContext, approved);
  send({ type: "agent_status", status: toolStatus(approved.toolName) });
  send({ type: "tool_start", tool: approved.toolName, toolCallId: approved.id });
  const execution = await executeAgentTool({
    id: approved.id,
    name: approved.toolName,
    arguments: JSON.stringify(approved.toolInput),
  }, pendingContext);
  const toolPayload = execution.result.success
    ? execution.result.data || {}
    : { message: execution.result.error || OLIVIA_FALLBACK_MESSAGES.toolFailureGeneric };
  send({
    type: "tool_result",
    tool: approved.toolName,
    toolCallId: approved.id,
    success: execution.result.success,
    result: toolPayload,
  });

  let nextPendingAction: OliviaPendingAction | undefined;
  let workingPendingContext = pendingContext;
  for (const action of execution.uiActions) {
    send({ type: "ui_action", action });
    nextPendingAction = pendingActionFromUiAction(action, workingPendingContext) || nextPendingAction;
    workingPendingContext = updateWorkingContext(workingPendingContext, action);
  }
  const text = nextPendingAction
    ? renderOliviaOutcome({ status: "needs_confirmation", prompt: nextPendingAction.prompt })
    : renderOliviaOutcome(toolResultOutcome(execution.result, approved));
  const resolvedAction = nextPendingAction
    || transitionPendingAction(approved, execution.result.success ? "completed" : "failed");
  await mergeAssistantConversationMetadata(db, { ownerId, conversationId, metadata: { pendingAction: resolvedAction } });
  await updateAssistantApprovalBlockState(db, {
    ownerId,
    conversationId,
    approvalId: approved.id,
    state: execution.result.success ? "approved" : "error",
  });
  send({ type: "text_delta", messageId, delta: text });
  const approvalBlock = pendingActionBlock(nextPendingAction);
  await saveTurnAssistant(text, {
    blocks: [{ type: "text", text }, ...(approvalBlock ? [approvalBlock] : [])],
    dialogueResolution: "approve",
    toolCalls: [{
      id: approved.id,
      name: approved.toolName,
      success: execution.result.success,
      verification: execution.result.verification,
    }],
    ...resourceMetadataFromTool(approved.toolName, execution.result.data),
  });
  return { handled: true, pendingAction: resolvedAction };
}
