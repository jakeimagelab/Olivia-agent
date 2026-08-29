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
  create_quote: async (args) => {
    const opened = workspaceAction("quote", args);
    if (!opened.length) return opened;
    // Quote Workspace를 여는 것과 별개로, 채팅에도 live Preview 카드를 띄운다(스펙 §25) —
    // 이 카드는 useQuoteStore를 직접 구독해서 이후 채팅 편집에도 별도 트리거 없이 최신 합계를
    // 보여준다. id는 문자열 리터럴로 둔다 — lib/olivia/inline-tools/builtins.ts를 여기서
    // import하면 "use client" 컴포넌트/zustand 스토어가 이 파일을 통해 서버(toolExecutor.ts)
    // 번들에 딸려 들어간다(start_select_match_flow 리졸버에도 같은 이유로 적용된 규칙).
    const resourceId = value(args.result.data, "resourceId") || value(args.result.data, "quoteId");
    if (!resourceId) return opened;
    return [...opened, { type: "OPEN_CLIENT_TASK", task: "quote_preview", flowId: resourceId }];
  },
  create_contract: async (args) => workspaceAction("contract", args),
  create_conti: async (args) => workspaceAction("conti", args),
  update_quote_item: async ({ result }) => mutationActions("quote", result, "quote-item"),
  add_quote_item: async ({ result }) => mutationActions("quote", result, "quote-item"),
  remove_quote_item: async ({ result }) => mutationActions("quote", result),
  update_quote_note: async ({ result }) => mutationActions("quote", result),
  update_quote_info: async ({ result }) => mutationActions("quote", result),
  apply_quote_discount: async ({ result }) => mutationActions("quote", result),
  update_quote_vat_mode: async ({ result }) => mutationActions("quote", result),
  rebalance_quote_total: async ({ result }) => {
    if (!result.success) return [];
    const resourceId = value(result.data, "resourceId");
    const discountAmount = result.data?.proposedDiscountAmount;
    if (!resourceId || typeof discountAmount !== "number") return [];
    return [{ type: "REQUEST_APPROVAL", approvalId: crypto.randomUUID(), summary: String(result.data?.summary || "견적 조정안을 적용할까요?"), confirmLabel: "적용", toolName: "apply_quote_rebalance", toolInput: { discountAmount } }];
  },
  preview_quote: async (args) => {
    const { result, context } = args;
    const resourceId = value(result.data, "resourceId");
    if (!result.success || !resourceId) return [];
    // 패널이 아직 안 열려 있으면(홈 등에서 바로 "미리보기 보여줘") SWITCH_WORKSPACE로 먼저
    // 열고 startInPreview로 시작 화면을 미리보기로 잡는다 — 이미 열려 있으면 QuoteBuilder가
    // 마운트 상태를 그대로 유지하므로 이 호출은 사실상 no-op이고, 아래 PREVIEW_QUOTE 이벤트가
    // 그 열려 있는 인스턴스의 미리보기를 토글한다(2026-08-25, "보여줘 → 어디?" 버그 수정).
    return [
      {
        type: "SWITCH_WORKSPACE",
        workspace: "quote",
        resourceId,
        clientId: value(result.data, "clientId") || context.activeClientId,
        workflowRunId: value(result.data, "workflowRunId") || context.activeProjectId,
        clientName: value(result.data, "hospitalName") || context.activeClientName,
        startInPreview: true,
      },
      { type: "PREVIEW_QUOTE", resourceId },
    ];
  },
  request_quote_publish: async ({ result }) => {
    if (!result.success) return [];
    return [{ type: "REQUEST_APPROVAL", approvalId: crypto.randomUUID(), summary: String(result.data?.summary || "견적서를 고객 포털에 공개할까요?"), confirmLabel: "공개", toolName: "publish_quote", toolInput: {} }];
  },
  apply_quote_rebalance: async ({ result }) => mutationActions("quote", result),
  publish_quote: async ({ result }) => mutationActions("quote", result),
  download_quote_pdf: async ({ result, context }) => {
    if (!result.success) return [];
    const resourceId = value(result.data, "resourceId") || context.activeResourceId;
    return resourceId ? [{ type: "DOWNLOAD_QUOTE_PDF", resourceId }] : [];
  },
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
    // 이 파일은 toolExecutor.ts를 통해 서버(app/api/olivia/v2/stream/route.ts)에서도 로드된다 —
    // 클라이언트 전용 Inline Tool Registry(lib/olivia/inline-tools/builtins.ts, "use client"
    // 컴포넌트 + zustand 스토어를 끌어옴)를 여기서 import하지 않기 위해 id는 문자열 리터럴로
    // 유지한다("select_match" — lib/olivia/inline-tools/builtins.ts의 SELECT_MATCH_TOOL_ID와
    // 반드시 같은 값이어야 한다).
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
  open_document: async ({ result, context }) => {
    if (!result.success) return [];
    const workspace = value(result.data, "workspace") as "quote" | "contract" | "conti" | undefined;
    const resourceId = value(result.data, "resourceId");
    if (workspace && resourceId) {
      return [context.activeWorkspace
        ? { type: "SWITCH_WORKSPACE", workspace, resourceId }
        : {
            type: "OPEN_WORKSPACE",
            workspace,
            resourceId,
            clientId: value(result.data, "clientId") || context.activeClientId,
            workflowRunId: value(result.data, "workflowRunId") || context.activeProjectId,
            clientName: value(result.data, "hospitalName") || context.activeClientName,
            projectName: context.activeProjectName,
          }];
    }
    const href = value(result.data, "href");
    return href ? [{ type: "OPEN_FEATURE", href }] : [];
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
