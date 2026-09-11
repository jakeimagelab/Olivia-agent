import type { AssistantChannel } from "@/lib/assistant/types";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import type { HermesChatContext, HermesChatMessage } from "@/lib/hermes/types";

type ContextMessage = {
  role: string;
  content: string;
  metadata?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resourceFromMetadata(value: unknown) {
  const metadata = record(value);
  const type = string(metadata.resourceType);
  const id = string(metadata.resourceId);
  if (!type || !id) return undefined;
  return {
    type,
    id,
    title: string(metadata.resourceTitle),
    status: string(metadata.resourceStatus),
    version: number(metadata.resourceVersion) ?? number(metadata.version),
    workSessionId: string(metadata.workSessionId),
    clientId: string(metadata.clientId),
    projectId: string(metadata.projectId),
  };
}

function referencesPreviousWork(message: string) {
  return /(아까|방금|그거|그것|이거|이것|거기|다시|이 견적|그 견적|이 계약|그 계약|이 콘티|그 콘티)/i.test(message);
}

function isExternalFileTask(message: string) {
  return /(다운로드|파일|폴더|사진|이미지).*(리사이즈|크기|픽셀|px|이동|복사|정리|변환)|(?:리사이즈|픽셀|px).*(?:사진|이미지)|다운로드.*(?:사진|이미지).*\d+/i.test(message);
}

function resourceTypeFromSnapshot(context: OliviaContextSnapshot) {
  return context.currentDocumentType || (["quote", "contract", "conti"].includes(context.activeWorkspace || "") ? context.activeWorkspace : undefined);
}

export function buildHermesRuntime(input: {
  snapshot: OliviaContextSnapshot;
  channel: AssistantChannel;
  today: string;
  message: string;
  history: ContextMessage[];
  replyContext?: unknown;
}) {
  const replyResource = resourceFromMetadata(input.replyContext);
  const recentResources = [...input.history].reverse().flatMap((message) => {
    const resource = resourceFromMetadata(message.metadata);
    return resource ? [resource] : [];
  });
  const snapshotResourceId = input.snapshot.currentDocumentId || input.snapshot.activeResourceId;
  const snapshotResourceType = resourceTypeFromSnapshot(input.snapshot);
  const snapshotResource = snapshotResourceId && snapshotResourceType && !isExternalFileTask(input.message) ? {
    type: snapshotResourceType,
    id: snapshotResourceId,
    title: input.snapshot.currentDocumentTitle,
    status: input.snapshot.documentStatus,
    version: undefined,
    workSessionId: undefined,
    clientId: input.snapshot.activeClientId,
    projectId: input.snapshot.activeProjectId,
  } : undefined;
  const recentResource = referencesPreviousWork(input.message) ? recentResources[0] : undefined;
  // Reply가 가장 강한 명시적 참조이고, 그 다음은 지금 실제 UI에 열린 resource다.
  const resource = replyResource || snapshotResource || recentResource;
  const workSessionId = resource?.workSessionId || (resource ? `resource:${resource.type}:${resource.id}` : undefined);
  const workSession = workSessionId ? {
    id: workSessionId,
    title: resource?.title,
    status: "active" as const,
    resourceType: resource?.type,
    resourceId: resource?.id,
    clientId: replyResource?.clientId || input.snapshot.activeClientId || recentResource?.clientId,
    projectId: replyResource?.projectId || input.snapshot.activeProjectId || recentResource?.projectId,
  } : undefined;

  const activeClientId = replyResource?.clientId || input.snapshot.activeClientId || recentResource?.clientId;
  const activeProjectId = replyResource?.projectId || input.snapshot.activeProjectId || recentResource?.projectId;
  const context: HermesChatContext = {
    ...input.snapshot,
    today: input.today,
    todayDate: input.today,
    channel: input.channel,
    activeClientId,
    activeClientName: input.snapshot.activeClientName,
    activeProjectId,
    activeProjectName: input.snapshot.activeProjectName,
    activeWorkspace: input.snapshot.activeWorkspace,
    activeResourceId: resource?.id,
    activeClient: activeClientId || input.snapshot.activeClientName ? { id: activeClientId, name: input.snapshot.activeClientName } : undefined,
    activeProject: activeProjectId || input.snapshot.activeProjectName ? { id: activeProjectId, name: input.snapshot.activeProjectName } : undefined,
    activeResource: resource ? { type: resource.type, id: resource.id, title: resource.title, status: resource.status, version: resource.version } : undefined,
    selectedEntity: input.snapshot.selectedEntityId || input.snapshot.selectedEntityType ? { type: input.snapshot.selectedEntityType, id: input.snapshot.selectedEntityId } : undefined,
    selectedRowId: input.snapshot.selectedRowId,
    selectedSceneId: input.snapshot.selectedSceneId,
    selectedScheduleId: input.snapshot.selectedScheduleId,
    brand: input.snapshot.brand,
    permissions: input.snapshot.canEdit !== undefined || input.snapshot.canFinalize !== undefined
      ? { canEdit: input.snapshot.canEdit, canFinalize: input.snapshot.canFinalize }
      : undefined,
    workSession,
  };

  const related = workSessionId
    ? input.history.filter((message) => {
        const metadata = record(message.metadata);
        const resourceMetadata = resourceFromMetadata(metadata);
        return metadata.workSessionId === workSessionId
          || (resourceMetadata?.type === resource?.type && resourceMetadata?.id === resource?.id);
      })
    : [];
  const candidates = [...related.slice(-8), ...input.history.slice(-6)];
  const seen = new Set<string>();
  const history = candidates.flatMap((message): HermesChatMessage[] => {
    if ((message.role !== "user" && message.role !== "assistant") || !message.content) return [];
    const key = `${message.role}:${message.content}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ role: message.role, content: message.content }];
  }).slice(-12);

  return { context, history, workSession };
}

export function resourceSessionMetadata(input: {
  resourceType?: string;
  resourceId?: string;
  resourceTitle?: string;
  resourceStatus?: string;
  resourceVersion?: number;
  clientId?: string;
  projectId?: string;
}) {
  if (!input.resourceType || !input.resourceId) return {};
  return {
    ...input,
    workSessionId: `resource:${input.resourceType}:${input.resourceId}`,
  };
}
