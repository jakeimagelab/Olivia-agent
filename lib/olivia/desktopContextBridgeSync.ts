import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

export type NamedContextValue = {
  id?: string;
  name?: string;
};

export type WorkspaceContextValue = {
  workspace?: string;
  resourceId?: string;
};

export type DocumentContextValue = {
  id?: string;
  type?: string;
};

export type OliviaBridgeContext = {
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  workspace?: string;
  resourceId?: string;
};

/**
 * Window -> Olivia 동기화는 창이 가진 값이 있을 때만 seed한다. Olivia 쪽 선택이
 * 바뀐 것만으로 이 함수가 다시 호출되면 안 되며, hook은 windowId/id/name 스칼라만
 * effect dependency로 사용한다.
 */
export function resolveNamedContextSeed({
  windowId,
  windowValue,
  activeValue,
}: {
  windowId?: string;
  windowValue: NamedContextValue;
  activeValue: NamedContextValue;
}): NamedContextValue | null {
  if (!windowId || (!windowValue.id && !windowValue.name)) return null;
  if (windowValue.id === activeValue.id && windowValue.name === activeValue.name) return null;
  return windowValue;
}

export function resolveWorkspaceContextSeed({
  windowId,
  mappedWorkspace,
  windowResourceId,
  activeValue,
}: {
  windowId?: string;
  mappedWorkspace?: string;
  windowResourceId?: string;
  activeValue: WorkspaceContextValue;
}): WorkspaceContextValue | null {
  if (!windowId) return null;
  if (mappedWorkspace === activeValue.workspace && windowResourceId === activeValue.resourceId) return null;
  return { workspace: mappedWorkspace, resourceId: windowResourceId };
}

export function resolveDocumentContextSeed({
  windowId,
  windowValue,
  activeValue,
}: {
  windowId?: string;
  windowValue: DocumentContextValue;
  activeValue: DocumentContextValue;
}): DocumentContextValue | null {
  if (!windowId) return null;
  if (windowValue.id === activeValue.id && windowValue.type === activeValue.type) return null;
  return windowValue;
}

/**
 * Olivia -> Window 역방향 동기화의 다음 값을 만든다. customer 창에서는 사용자가
 * ClientsWorkspace에서 고른 Olivia context가 최종 source of truth다. 다른 앱은 기존처럼
 * 비어 있지 않은 전역 선택만 창에 반영한다.
 */
export function buildWindowContextFromOlivia({
  appId,
  mappedWorkspace,
  windowContext,
  oliviaContext,
}: {
  appId: string;
  mappedWorkspace?: string;
  windowContext?: WindowContext;
  oliviaContext: OliviaBridgeContext;
}): WindowContext {
  const customerOwnsSelection = appId === "customer";
  return {
    ...windowContext,
    clientId: customerOwnsSelection
      ? oliviaContext.clientId
      : oliviaContext.clientId ?? windowContext?.clientId,
    clientName: customerOwnsSelection
      ? oliviaContext.clientName
      : oliviaContext.clientName ?? windowContext?.clientName,
    projectId: customerOwnsSelection
      ? oliviaContext.projectId
      : oliviaContext.projectId ?? windowContext?.projectId,
    projectName: customerOwnsSelection
      ? oliviaContext.projectName
      : oliviaContext.projectName ?? windowContext?.projectName,
    resourceId: mappedWorkspace && oliviaContext.workspace === mappedWorkspace
      ? oliviaContext.resourceId
      : windowContext?.resourceId,
    resourceType: mappedWorkspace ?? windowContext?.resourceType,
  };
}

/** 테스트에서 project/resource 변화가 client effect dependency를 바꾸지 않는지 검증한다. */
export function getWindowClientSyncKey(
  windowId: string | undefined,
  context: WindowContext | undefined,
) {
  return [windowId ?? "", context?.clientId ?? "", context?.clientName ?? ""] as const;
}
