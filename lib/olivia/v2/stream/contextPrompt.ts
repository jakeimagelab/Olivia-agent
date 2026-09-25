import type { ResponseInputItem } from "openai/resources/responses/responses";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { isWellFormedHistoryText } from "@/lib/olivia/output/scriptSanitizer";
import type { listAssistantMessages } from "@/lib/assistant/conversations/service";

// PHASE 4 작업 5(2026-09-25) — app/api/olivia/v2/stream/route.ts에서 그대로 옮겼다. 동작 변경 없음.

export type ConversationMessage = Awaited<ReturnType<typeof listAssistantMessages>>[number];

export function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

export function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function normalizeContext(value: unknown): OliviaContextSnapshot {
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
    currentDocumentId: optionalString(input.currentDocumentId),
    currentDocumentType: optionalString(input.currentDocumentType),
    currentDocumentTitle: optionalString(input.currentDocumentTitle),
    currentDocumentTotal: typeof input.currentDocumentTotal === "number" ? input.currentDocumentTotal : undefined,
    currentDocumentDirty: optionalBoolean(input.currentDocumentDirty),
    pageMode: (["create", "edit", "view", "list"] as const).find((mode) => mode === input.pageMode),
    capabilities: Array.isArray(input.capabilities)
      ? input.capabilities.filter((capability): capability is string => typeof capability === "string" && Boolean(capability)).slice(0, 50)
      : undefined,
    selectedRowId: optionalString(input.selectedRowId),
    selectedSceneId: optionalString(input.selectedSceneId),
    documentStatus: optionalString(input.documentStatus),
    brand: optionalString(input.brand),
    canEdit: optionalBoolean(input.canEdit),
    canComplete: optionalBoolean(input.canComplete),
    canPublish: optionalBoolean(input.canPublish),
    canFinalize: optionalBoolean(input.canFinalize),
  };
}

export function contextPrompt(context: OliviaContextSnapshot, pageContext?: string, temporalHint?: string) {
  const effectiveCanComplete = context.canComplete ?? context.canFinalize;
  const effectiveCanPublish = context.canPublish ?? context.canFinalize;
  const lines = [
    "판단 우선순위: 현재 PageContext > 실제 Tool/DB 결과 > 최근 Agent Context > 대화 텍스트 > 추론. 현재 PageContext와 충돌하는 값을 추측하지 않는다.",
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
    context.pageMode ? `현재 페이지 모드: ${context.pageMode}` : null,
    context.capabilities?.length ? `현재 페이지 기능: ${context.capabilities.join(", ")}` : null,
    context.selectedRowId ? `현재 선택 행 ID: ${context.selectedRowId}` : null,
    context.selectedSceneId ? `현재 선택 장면 ID: ${context.selectedSceneId}` : null,
    context.documentStatus ? `현재 문서 상태: ${context.documentStatus}` : null,
    context.brand ? `현재 브랜드: ${context.brand} — 대화에서 다른 브랜드를 추측하지 않는다.` : null,
    typeof context.canEdit === "boolean" ? `현재 수정 가능: ${context.canEdit ? "예" : "아니오"}` : null,
    typeof effectiveCanComplete === "boolean" ? `현재 내부 최종완료 가능: ${effectiveCanComplete ? "예" : "아니오"}` : null,
    typeof effectiveCanPublish === "boolean" ? `현재 포털 공개 가능: ${effectiveCanPublish ? "예" : "아니오"}` : null,
    context.canEdit === false ? "현재 페이지 종속 수정 Tool을 실행하지 말고 수정 불가 상태를 안내한다." : null,
    effectiveCanComplete === false ? "현재 문서의 내부 최종완료 Tool을 실행하지 않는다." : null,
    effectiveCanPublish === false ? "현재 문서의 고객 포털 공개 Tool을 실행하지 않는다." : null,
    context.recentActions.length
      ? `최근 UI Action: ${context.recentActions.slice(-4).map((action) => action.type).join(" → ")}`
      : null,
    context.lastTool
      ? `마지막으로 실행한 도구: ${context.lastTool}${context.lastIntent ? ` (${context.lastIntent})` : ""} — "그거"/"그것도"/"아까 그거"가 이 도구를 다시 가리킬 수 있다.`
      : null,
    context.currentDocumentId
      ? `현재 채팅이 열어본 문서: ${context.currentDocumentTitle || "제목 없음"} (${context.currentDocumentType || "종류 미상"}, id=${context.currentDocumentId}) — "여기에"/"이 문서에"/"방금 그거" 같은 표현은 다시 검색하지 말고 이 문서를 가리킨다.`
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
export function summarizeOlderMessages(rows: ConversationMessage[]): string | undefined {
  if (rows.length <= 30) return undefined;
  const lines = rows
    .slice(0, -30)
    .filter((row) => row.role === "assistant")
    .slice(-20)
    .map((row) => String(row.content || "").split("\n")[0].slice(0, 90))
    .filter(Boolean);
  return lines.length ? lines.join("\n") : undefined;
}

export function toInputMessages(
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

export function updateWorkingContext(context: OliviaContextSnapshot, action: OliviaUiAction): OliviaContextSnapshot {
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
