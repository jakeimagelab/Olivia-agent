import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processOliviaRequest } from "@/lib/assistant/core/legacyOliviaCore";
import { createAssistantConfirmation } from "@/lib/assistant/confirmations/service";
import { recordAssistantAudit } from "@/lib/assistant/audit/service";
import type { AssistantChannel } from "@/lib/assistant/types";

export type OliviaCoreMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LegacyOliviaToolRequest = {
  name: string;
  input: Record<string, unknown>;
  id?: string;
};

type OliviaCoreResponse =
  | { ok: true; type: "message"; text: string }
  | {
      ok: true;
      type: "tool_request";
      text?: string;
      tool: LegacyOliviaToolRequest;
      tools?: LegacyOliviaToolRequest[];
    }
  | { ok: true; toolResult: unknown }
  | { ok: false; error: string };

const LEGACY_TOOL_ACTION_NAMES: Record<string, string> = {
  calendar_list: "calendar.search",
  calendar_availability: "calendar.getAvailability",
  calendar_add: "calendar.create",
  calendar_add_bulk: "calendar.create",
  calendar_update: "calendar.update",
  calendar_delete: "calendar.cancel",
  calendar_complete: "task.complete",
  memo_add: "memo.create",
  search_client_projects: "project.search",
  get_project_status: "project.getStatus",
  get_gallery: "photo.getStatus",
  create_quote: "quote.createDraft",
  create_contract: "contract.create",
  send_file_transfer: "email.send",
  email_search: "email.search",
  email_read: "email.read",
  email_summarize: "email.summarize",
  email_create_draft: "email.createDraft",
  create_feature_record: "feature.create",
  update_feature_record: "feature.update",
};

const LEGACY_READ_TOOLS = new Set([
  "calendar_list",
  "calendar_availability",
  "search_client_projects",
  "get_project_status",
  "get_gallery",
  "query_database",
  "email_search",
  "email_read",
  "email_summarize",
  "get_today_brief",
  "get_urgent_work",
  "get_pending_approvals",
  "get_client_responses",
  "get_commitments",
  "get_workflow_status",
  "get_recent_activity",
  "get_meeting_brief",
]);

const LEGACY_ALWAYS_CONFIRM_TOOLS = new Set([
  "calendar_add",
  "calendar_add_bulk",
  "calendar_update",
  "calendar_delete",
  "create_contract",
  "send_file_transfer",
  "update_feature_record",
]);

function mapLegacyToolActionName(tool: LegacyOliviaToolRequest): string {
  if (tool.name === "create_feature_record") {
    const domain = String(tool.input.domain || "");
    if (domain === "memo") return "memo.create";
    if (domain === "agent_task") return "task.create";
    if (domain === "calendar") return "calendar.create";
    return `feature.${domain || "create"}.create`;
  }
  return LEGACY_TOOL_ACTION_NAMES[tool.name] || `legacy.${tool.name}`;
}

function legacyToolNeedsConfirmation(tool: LegacyOliviaToolRequest): boolean {
  if (LEGACY_READ_TOOLS.has(tool.name)) return false;
  if (LEGACY_ALWAYS_CONFIRM_TOOLS.has(tool.name)) return true;
  if (tool.name === "create_feature_record") {
    const domain = String(tool.input.domain || "");
    return !["memo", "agent_task"].includes(domain);
  }
  return false;
}

async function readCoreResponse(response: Response): Promise<OliviaCoreResponse> {
  const data = (await response.json()) as OliviaCoreResponse;
  return data;
}

export async function requestOliviaCore(
  req: NextRequest,
  input: {
    messages: OliviaCoreMessage[];
    pageContext?: string;
  },
): Promise<OliviaCoreResponse> {
  const response = await processOliviaRequest(
    {
      messages: input.messages,
      pageContext: input.pageContext,
    },
    req,
  );
  return readCoreResponse(response);
}

export async function executeLegacyOliviaTool(
  req: NextRequest,
  tool: LegacyOliviaToolRequest,
): Promise<OliviaCoreResponse> {
  const response = await processOliviaRequest({ pendingTool: tool }, req);
  return readCoreResponse(response);
}

function formatToolResult(result: unknown): string {
  if (!result) return "요청을 처리했습니다.";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const record = result as Record<string, unknown>;
    for (const key of ["message", "text", "summary"]) {
      if (typeof record[key] === "string" && record[key]) {
        return record[key] as string;
      }
    }
    if (record.action && typeof record.action === "object") {
      const action = record.action as Record<string, unknown>;
      if (typeof action.message === "string") return action.message;
    }
  }
  return "요청을 처리했습니다. 자세한 결과는 Olivia 웹에서 확인해 주세요.";
}

export type PreparedOliviaChannelResponse =
  | { kind: "message"; text: string }
  | {
      kind: "confirmation";
      text: string;
      token: string;
      actionRequestId: string;
      expiresAt: string;
    };

export async function processOliviaChannelMessage(input: {
  db: SupabaseClient;
  req: NextRequest;
  ownerId: string;
  conversationId: string;
  messageId?: string;
  channel: AssistantChannel;
  requestId: string;
  messages: OliviaCoreMessage[];
}): Promise<PreparedOliviaChannelResponse> {
  const core = await requestOliviaCore(input.req, {
    messages: input.messages,
    pageContext: `${input.channel} 채널의 대표자 전용 Olivia 대화`,
  });
  if (!core.ok) throw new Error(core.error);
  if ("toolResult" in core) {
    return { kind: "message", text: formatToolResult(core.toolResult) };
  }
  if (core.type === "message") {
    return { kind: "message", text: core.text || "무엇을 도와드릴까요?" };
  }

  const tool = core.tool;
  const actionName = mapLegacyToolActionName(tool);
  const confirmationRequired = legacyToolNeedsConfirmation(tool);
  const idempotencyKey = [
    input.channel,
    input.requestId,
    tool.id || tool.name,
  ].join(":");
  let { data: action, error: actionError } = await input.db
    .from("assistant_action_requests")
    .insert({
      owner_id: input.ownerId,
      conversation_id: input.conversationId,
      message_id: input.messageId ?? null,
      source_channel: input.channel,
      action_name: actionName,
      parameters: {
        legacyTool: {
          name: tool.name,
          input: tool.input,
          id: tool.id,
        },
      },
      permission_level: "OWNER",
      confirmation_required: confirmationRequired,
      status: confirmationRequired ? "queued" : "processing",
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();
  if (actionError?.code === "23505") {
    const existing = await input.db
      .from("assistant_action_requests")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .single();
    action = existing.data;
    actionError = existing.error;
  }
  if (actionError) throw new Error(`Action 기록 실패: ${actionError.message}`);
  if (!action) throw new Error("Action 기록 결과가 없습니다.");
  if (action.status === "queued" || action.status === "processing") {
    await recordAssistantAudit(input.db, {
      ownerId: input.ownerId,
      sourceChannel: input.channel,
      eventType: "action_requested",
      action: actionName,
      targetType: "assistant_action_request",
      targetId: action.id,
      afterData: {
        confirmationRequired,
        parameters: tool.input,
      },
      requestId: input.requestId,
    });
  }

  if (confirmationRequired) {
    if (action.status === "completed") {
      return {
        kind: "message",
        text: formatToolResult(action.result),
      };
    }
    if (action.status === "waiting_confirmation") {
      return {
        kind: "message",
        text: "이미 확인을 기다리고 있는 작업입니다. 기존 확인 메시지에서 진행 또는 취소를 선택해 주세요.",
      };
    }
    if (!["queued", "processing"].includes(action.status)) {
      return {
        kind: "message",
        text: "이미 처리되었거나 실행할 수 없는 요청입니다.",
      };
    }
    const confirmation = await createAssistantConfirmation(input.db, {
      actionRequestId: action.id,
      ownerId: input.ownerId,
    });
    return {
      kind: "confirmation",
      text:
        core.text?.trim() ||
        `${actionName} 작업을 실행할까요?\n내용을 확인한 뒤 진행 또는 취소를 선택해 주세요.`,
      token: confirmation.token,
      actionRequestId: action.id,
      expiresAt: confirmation.expiresAt,
    };
  }

  if (action.status === "completed") {
    return { kind: "message", text: formatToolResult(action.result) };
  }
  if (action.status !== "processing") {
    return {
      kind: "message",
      text: "동일한 요청을 이미 처리하고 있습니다.",
    };
  }

  await recordAssistantAudit(input.db, {
    ownerId: input.ownerId,
    sourceChannel: input.channel,
    eventType: "action_execution_started",
    action: actionName,
    targetType: "assistant_action_request",
    targetId: action.id,
    requestId: input.requestId,
  });
  const executed = await executeLegacyOliviaTool(input.req, tool);
  if (!executed.ok) {
    await input.db
      .from("assistant_action_requests")
      .update({
        status: "failed",
        error_message: executed.error.slice(0, 2_000),
      })
      .eq("id", action.id)
      .eq("status", "processing");
    throw new Error(executed.error);
  }
  const result = "toolResult" in executed ? executed.toolResult : executed;
  await input.db
    .from("assistant_action_requests")
    .update({
      status: "completed",
      result,
      executed_at: new Date().toISOString(),
    })
    .eq("id", action.id)
    .eq("status", "processing");
  await recordAssistantAudit(input.db, {
    ownerId: input.ownerId,
    sourceChannel: input.channel,
    eventType: "action_completed",
    action: actionName,
    targetType: "assistant_action_request",
    targetId: action.id,
    afterData: { result },
    requestId: input.requestId,
  });
  return { kind: "message", text: formatToolResult(result) };
}

export async function executeApprovedAssistantAction(input: {
  db: SupabaseClient;
  req: NextRequest;
  ownerId: string;
  actionRequestId: string;
}) {
  const { data: action, error } = await input.db
    .from("assistant_action_requests")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", input.actionRequestId)
    .eq("owner_id", input.ownerId)
    .eq("status", "approved")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`승인 Action 조회 실패: ${error.message}`);
  if (!action) return null;

  const legacyTool = action.parameters?.legacyTool as
    | LegacyOliviaToolRequest
    | undefined;
  if (!legacyTool?.name) {
    await input.db
      .from("assistant_action_requests")
      .update({
        status: "failed",
        error_code: "ACTION_PAYLOAD_INVALID",
        error_message: "실행할 Action 정보가 없습니다.",
      })
      .eq("id", action.id);
    throw new Error("실행할 Action 정보가 없습니다.");
  }

  try {
    await recordAssistantAudit(input.db, {
      ownerId: input.ownerId,
      sourceChannel: action.source_channel,
      eventType: "action_execution_started",
      action: action.action_name,
      targetType: "assistant_action_request",
      targetId: action.id,
      requestId: action.idempotency_key,
    });
    const executed = await executeLegacyOliviaTool(input.req, legacyTool);
    if (!executed.ok) throw new Error(executed.error);
    const result = "toolResult" in executed ? executed.toolResult : executed;
    const { data: completed, error: completeError } = await input.db
      .from("assistant_action_requests")
      .update({
        status: "completed",
        result,
        executed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", action.id)
      .eq("status", "processing")
      .select("*")
      .single();
    if (completeError) throw new Error(completeError.message);
    await recordAssistantAudit(input.db, {
      ownerId: input.ownerId,
      sourceChannel: action.source_channel,
      eventType: "action_completed",
      action: action.action_name,
      targetType: "assistant_action_request",
      targetId: action.id,
      afterData: { result },
      requestId: action.idempotency_key,
    });
    return {
      action: completed,
      message: formatToolResult(result),
    };
  } catch (executionError) {
    const message =
      executionError instanceof Error
        ? executionError.message
        : "Action 실행에 실패했습니다.";
    await input.db
      .from("assistant_action_requests")
      .update({
        status: "failed",
        error_code: "ACTION_EXECUTION_FAILED",
        error_message: message.slice(0, 2_000),
      })
      .eq("id", action.id)
      .eq("status", "processing");
    await recordAssistantAudit(input.db, {
      ownerId: input.ownerId,
      sourceChannel: action.source_channel,
      eventType: "action_failed",
      action: action.action_name,
      targetType: "assistant_action_request",
      targetId: action.id,
      afterData: { error: message.slice(0, 2_000) },
      requestId: action.idempotency_key,
    });
    throw executionError;
  }
}
