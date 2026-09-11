import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resumeAgentRunsForApproval } from "@/lib/olivia/agentRuns/service";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { mergeAssistantConversationMetadata, saveAssistantMessage, updateAssistantApprovalBlockState } from "@/lib/assistant/conversations/service";
import { pendingActionBlock, pendingActionFromUiAction, readPendingAction, resolvePendingActionContext, transitionPendingAction } from "@/lib/olivia/conversation/dialogueState";
import { renderOliviaOutcome, toolResultOutcome } from "@/lib/olivia/conversation/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVABLE_TOOLS = new Set(["apply_quote_rebalance", "publish_quote", "publish_contract", "apply_remove_conti_shot", "remove_conti_scene_v2", "apply_send_mailing", "apply_feature_record_write", "approve_temporary_document", "link_temporary_document_client"]);

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await req.json() as Record<string, unknown>;
  const db = getSupabaseAdmin();
  const owner = await ensurePrimaryAssistantOwner(db);
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  let pendingAction;
  if (conversationId) {
    const { data: conversation, error } = await db.from("assistant_conversations")
      .select("metadata").eq("id", conversationId).eq("owner_id", owner.id).maybeSingle();
    if (error || !conversation) return NextResponse.json({ ok: false, error: "대화 상태를 찾지 못했어요." }, { status: 404 });
    pendingAction = readPendingAction(conversation.metadata);
    if (pendingAction && pendingAction.id === body.approvalId && pendingAction.status !== "pending") {
      return NextResponse.json({ ok: false, error: "이미 처리된 작업이에요." }, { status: 409 });
    }
  }
  const matchingPending = pendingAction?.id === body.approvalId ? pendingAction : undefined;
  if (conversationId && pendingAction && !matchingPending) {
    return NextResponse.json({ ok: false, error: "이미 처리됐거나 더 이상 유효하지 않은 요청이에요." }, { status: 409 });
  }
  if (body.decision === "reject") {
    if (!conversationId || !matchingPending) return NextResponse.json({ ok: false, error: "취소할 요청을 찾지 못했어요." }, { status: 404 });
    const rejected = transitionPendingAction(matchingPending, "rejected");
    const message = renderOliviaOutcome({ status: "rejected" });
    await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId, metadata: { pendingAction: rejected } });
    await updateAssistantApprovalBlockState(db, { ownerId: owner.id, conversationId, approvalId: matchingPending.id, state: "cancelled" });
    await saveAssistantMessage(db, { ownerId: owner.id, conversationId, role: "assistant", content: message, channel: "web", metadata: { blocks: [{ type: "text", text: message }], dialogueResolution: "reject" } });
    return NextResponse.json({ ok: true, message });
  }
  const toolName = matchingPending?.toolName || (typeof body.toolName === "string" ? body.toolName : "");
  if (!APPROVABLE_TOOLS.has(toolName)) return NextResponse.json({ ok: false, error: "승인할 수 없는 작업입니다." }, { status: 400 });
  const input = matchingPending?.toolInput || (body.toolInput && typeof body.toolInput === "object" && !Array.isArray(body.toolInput) ? body.toolInput : {});
  const rawContext = body.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context as OliviaContextSnapshot : { recentActions: [], revision: 0 };
  const context = matchingPending ? resolvePendingActionContext(rawContext, matchingPending) : rawContext;
  if (conversationId && matchingPending) {
    await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId, metadata: { pendingAction: transitionPendingAction(matchingPending, "approved") } });
  }
  const execution = await executeAgentTool({ id: String(body.approvalId || crypto.randomUUID()), name: toolName, arguments: JSON.stringify(input) }, context);
  const nextPendingAction = execution.uiActions.reduce((current, action) => pendingActionFromUiAction(action, context) || current, undefined as ReturnType<typeof pendingActionFromUiAction>);
  const message = nextPendingAction
    ? renderOliviaOutcome({ status: "needs_confirmation", prompt: nextPendingAction.prompt })
    : renderOliviaOutcome(toolResultOutcome(execution.result, matchingPending));
  if (conversationId && matchingPending) {
    await mergeAssistantConversationMetadata(db, { ownerId: owner.id, conversationId, metadata: { pendingAction: nextPendingAction || transitionPendingAction(matchingPending, execution.result.success ? "completed" : "failed") } });
    await updateAssistantApprovalBlockState(db, { ownerId: owner.id, conversationId, approvalId: matchingPending.id, state: execution.result.success ? "approved" : "error" });
    const approvalBlock = pendingActionBlock(nextPendingAction);
    await saveAssistantMessage(db, {
      ownerId: owner.id,
      conversationId,
      role: "assistant",
      content: message,
      channel: "web",
      metadata: { blocks: [{ type: "text", text: message }, ...(approvalBlock ? [approvalBlock] : [])], dialogueResolution: "approve", toolCalls: [{ id: body.approvalId, name: toolName, success: execution.result.success, verification: execution.result.verification }] },
    });
  }
  if (!execution.result.success) return NextResponse.json({ ok: false, error: message }, { status: 400 });
  await resumeAgentRunsForApproval(db,String(body.approvalId || "")).catch((error)=>console.warn("[OliviaAgentRun] approval resume failed",error));
  return NextResponse.json({ ok: true, result: execution.result.data, uiActions: execution.uiActions, message });
}
