import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { OliviaContextSnapshot, OliviaToolCall, OliviaToolResult } from "@/lib/olivia/v2/types";

export type UiActionResolverArgs = {
  input: Record<string, unknown>;
  result: OliviaToolResult;
  context: OliviaContextSnapshot;
};

export type UiActionResolver = (args: UiActionResolverArgs) => Promise<OliviaUiAction[] | OliviaUiAction | null>;

function value(data: Record<string, unknown> | undefined, key: string) {
  const current = data?.[key];
  return typeof current === "string" && current ? current : undefined;
}

function workspaceAction(
  workspace: "quote" | "contract" | "conti",
  args: UiActionResolverArgs,
): OliviaUiAction[] {
  if (!args.result.success) return [];
  const data = args.result.data;
  const resourceId = value(data, "resourceId") || value(data, `${workspace}Id`);
  if (!resourceId) return [];
  return [{
    type: "OPEN_WORKSPACE",
    workspace,
    resourceId,
    clientId: value(data, "clientId") || args.context.activeClientId,
    workflowRunId: value(data, "workflowRunId") || args.context.activeProjectId,
    clientName: value(data, "hospitalName") || args.context.activeClientName,
    projectName: args.context.activeProjectName,
  }];
}

function resolveFeatureRecordAction(result: OliviaToolResult): OliviaUiAction[] {
  if (!result.success) return [];
  if (result.data?.approvalRequired) {
    return [{
      type: "REQUEST_APPROVAL",
      approvalId: crypto.randomUUID(),
      summary: String(result.data?.summary || "이 변경에는 승인이 필요해요. 진행할까요?"),
      confirmLabel: "진행",
      toolName: "apply_feature_record_write",
      toolInput: {
        operation: result.data?.operation,
        domain: result.data?.domain,
        crudData: result.data?.crudData,
        target: result.data?.target,
      },
    }];
  }
  const href = value(result.data, "url");
  return href ? [{ type: "OPEN_FEATURE", href }] : [];
}

export const uiActionResolvers: Record<string, UiActionResolver> = {
  select_project: async ({ result }) => {
    if (!result.success) return [];
    return [{
      type: "UPDATE_CONTEXT",
      clientId: value(result.data, "clientId"),
      clientName: value(result.data, "clientName"),
      projectId: value(result.data, "projectId"),
      projectName: value(result.data, "projectName"),
    }];
  },
  create_quote: async (args) => workspaceAction("quote", args),
  create_contract: async (args) => workspaceAction("contract", args),
  create_conti: async (args) => workspaceAction("conti", args),
  update_quote_item: async ({ result }) => mutationActions("quote", result, "quote-item"),
  add_quote_item: async ({ result }) => mutationActions("quote", result, "quote-item"),
  remove_quote_item: async ({ result }) => mutationActions("quote", result),
  update_quote_note: async ({ result }) => mutationActions("quote", result),
  apply_quote_discount: async ({ result }) => mutationActions("quote", result),
  update_quote_vat_mode: async ({ result }) => mutationActions("quote", result),
  rebalance_quote_total: async ({ result }) => {
    if (!result.success) return [];
    const resourceId = value(result.data, "resourceId");
    const discountAmount = result.data?.proposedDiscountAmount;
    if (!resourceId || typeof discountAmount !== "number") return [];
    return [{ type: "REQUEST_APPROVAL", approvalId: crypto.randomUUID(), summary: String(result.data?.summary || "견적 조정안을 적용할까요?"), confirmLabel: "적용", toolName: "apply_quote_rebalance", toolInput: { discountAmount } }];
  },
  preview_quote: async ({ result }) => {
    const resourceId = value(result.data, "resourceId");
    return result.success && resourceId ? [{ type: "PREVIEW_QUOTE", resourceId }] : [];
  },
  request_quote_publish: async ({ result }) => {
    if (!result.success) return [];
    return [{ type: "REQUEST_APPROVAL", approvalId: crypto.randomUUID(), summary: String(result.data?.summary || "견적서를 고객 포털에 공개할까요?"), confirmLabel: "공개", toolName: "publish_quote", toolInput: {} }];
  },
  apply_quote_rebalance: async ({ result }) => mutationActions("quote", result),
  publish_quote: async ({ result }) => mutationActions("quote", result),
  add_conti_shots: async ({ result }) => mutationActions("conti", result, "conti-shot"),
  update_conti_shot: async ({ result }) => mutationActions("conti", result, "conti-shot"),
  reorder_conti_shot: async ({ result }) => mutationActions("conti", result, "conti-shot"),
  duplicate_conti_shot: async ({ result }) => mutationActions("conti", result, "conti-shot"),
  remove_conti_shot: async ({ result }) => {
    if (!result.success) return [];
    return [{ type: "REQUEST_APPROVAL", approvalId: crypto.randomUUID(), summary: String(result.data?.summary || "이 컷을 삭제할까요?"), confirmLabel: "삭제", toolName: "apply_remove_conti_shot", toolInput: { selector: null, position: result.data?.targetIndex == null ? null : Number(result.data.targetIndex) + 1 } }];
  },
  apply_remove_conti_shot: async ({ result }) => mutationActions("conti", result),
  open_feature: async ({ result }) => {
    if (!result.success) return [];
    const href = value(result.data, "href");
    if (!href) return [];
    return [{ type: "OPEN_FEATURE", href }];
  },
  start_select_match_flow: async ({ result }) => {
    if (!result.success) return [];
    const flowId = value(result.data, "flowId");
    return flowId ? [{ type: "OPEN_CLIENT_TASK", task: "select_match", flowId }] : [];
  },
  start_task_session: async ({ result }) => {
    if (!result.success) return [];
    const href = value(result.data, "href");
    return href ? [{ type: "OPEN_FEATURE", href }] : [];
  },
  continue_task_session: async ({ result }) => {
    if (!result.success) return [];
    const href = value(result.data, "href");
    return href ? [{ type: "OPEN_FEATURE", href }] : [];
  },
  // owner_only 필드가 섞이면 create_feature_record/update_feature_record 자체는 DB에 쓰지 않고
  // approvalRequired:true만 돌려준다(코드 요청서 4번 항목) — 여기서 그 표시를 보고 승인 카드로
  // 바꾼다. review_required(즉시 실행됨)나 일반 성공 건은 approvalRequired가 없으니 그대로 통과.
  create_feature_record: async ({ result }) => resolveFeatureRecordAction(result),
  update_feature_record: async ({ result }) => resolveFeatureRecordAction(result),
  apply_feature_record_write: async ({ result }) => {
    if (!result.success) return [];
    const url = value(result.data, "url");
    return url ? [{ type: "OPEN_FEATURE", href: url }] : [];
  },
  show_workspace: async ({ result, context }) => {
    if (!result.success) return [];
    const workspace = value(result.data, "workspace") as "quote" | "contract" | "conti" | undefined;
    const resourceId = value(result.data, "resourceId");
    if (!workspace || !resourceId) return [];
    return [context.activeWorkspace
      ? { type: "SWITCH_WORKSPACE", workspace, resourceId }
      : {
          type: "OPEN_WORKSPACE",
          workspace,
          resourceId,
          clientId: context.activeClientId,
          workflowRunId: context.activeProjectId,
          clientName: context.activeClientName,
          projectName: context.activeProjectName,
        }];
  },
};

function mutationActions(resource: "quote" | "conti", result: OliviaToolResult, entityType?: string): OliviaUiAction[] {
  if (!result.success) return [];
  const resourceId = value(result.data, "resourceId");
  if (!resourceId) return [];
  const changedEntityId = value(result.data, "changedEntityId");
  const actions: OliviaUiAction[] = [{ type: "REFRESH_RESOURCE", resource, resourceId, changedEntityId, before: result.data?.before, after: result.data?.updatedResource }];
  if (entityType && changedEntityId) actions.push({ type: "SET_SELECTION", entityType, entityId: changedEntityId });
  return actions;
}

export async function resolveUiActions(args: {
  toolCall: OliviaToolCall;
  input: Record<string, unknown>;
  result: OliviaToolResult;
  context: OliviaContextSnapshot;
}): Promise<OliviaUiAction[]> {
  if (!args.result.success) return [];
  const resolver = uiActionResolvers[args.toolCall.name];
  if (!resolver) return [];
  const resolved = await resolver({ input: args.input, result: args.result, context: args.context });
  if (!resolved) return [];
  return Array.isArray(resolved) ? resolved : [resolved];
}
