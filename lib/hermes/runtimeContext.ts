import type { AssistantChannel } from "@/lib/assistant/types";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import type { HermesChatContext, HermesChatMessage } from "@/lib/hermes/types";
import type { HermesMemoryEntry } from "@/lib/olivia/memory/format";
import { resolveTrustedClientProjectContext } from "@/lib/core/context/clientTarget";

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
    clientName: string(metadata.clientName),
    projectId: string(metadata.projectId),
    projectName: string(metadata.projectName),
  };
}

function referencesPreviousWork(message: string) {
  return /(아까|방금|그거|그것|이거|이것|거기|다시|이 견적|그 견적|이 계약|그 계약|이 콘티|그 콘티)/i.test(message);
}

// Olivia OS 2.0 — Hermes Chat Intelligence Upgrade §6/§17. "열어"/"바꿔줘"류 UI 실행 요청.
// lib/hermes/client.ts의 isUiExecutionIntent()와 같은 판정 기준을 쓴다 — 완료 주장 검증(§7)과
// 여기(어떤 resource를 쓸지)가 다른 판정 기준을 쓰면 "실행됐다고 판단한 대상"과 "실제로 연
// 도구를 부른 대상"이 어긋날 수 있다.
function isUiExecutionFollowup(message: string) {
  return /(열어줘|열어|보여줘|띄워줘|바꿔줘|바꿔|전환해|이동해|가\s*줘|거기로\s*가|다시\s*열어|그걸로\s*바꿔)/i.test(message);
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
  memories?: HermesMemoryEntry[];
  compactConversationSummary?: string;
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
    clientName: input.snapshot.activeClientName,
    projectId: input.snapshot.activeProjectId,
    projectName: input.snapshot.activeProjectName,
  } : undefined;
  // §17 "Active UI와 대화 대상 불일치 처리" — "그럼 바꿔줘"/"열어"처럼 이번 메시지 자체에는
  // 대상이 없는 후속 실행 명령이면, 지금 실제 열려 있는 화면(snapshotResource)보다 방금 전
  // turn에서 이미 찾아둔 resource를 우선한다. 안 그러면 채팅에서 찾은 문서와 실제 열린 화면이
  // 다를 때(예: 채팅=최근 견적 A, 화면=견적 B) "바꿔줘"가 지금 열린 B를 다시 골라버려서
  // 사용자가 원한 A로 전환되지 않는다. isExternalFileTask면 이 메시지가 가리키는 대상이 아예
  // 문서 workspace가 아니므로("다운로드 사진 4500으로 바꿔") 이 우선순위를 적용하지 않는다.
  const followupReference = (referencesPreviousWork(input.message) || isUiExecutionFollowup(input.message))
    && !isExternalFileTask(input.message);
  const recentResource = followupReference ? recentResources[0] : undefined;
  const resource = replyResource || (followupReference && recentResource) || snapshotResource || recentResource;
  const workSessionId = resource?.workSessionId || (resource ? `resource:${resource.type}:${resource.id}` : undefined);
  const resolvedClientProject = resolveTrustedClientProjectContext({
    message: input.message,
    snapshot: input.snapshot,
    explicit: replyResource,
    recent: recentResource,
  });
  const activeClientId = resolvedClientProject.clientId;
  const activeClientName = resolvedClientProject.clientName;
  const activeProjectId = resolvedClientProject.projectId;
  const activeProjectName = resolvedClientProject.projectName;
  const workSession = workSessionId ? {
    id: workSessionId,
    title: resource?.title,
    status: "active" as const,
    resourceType: resource?.type,
    resourceId: resource?.id,
    clientId: activeClientId,
    projectId: activeProjectId,
  } : undefined;

  const context: HermesChatContext = {
    ...input.snapshot,
    currentRequestText: input.message,
    today: input.today,
    todayDate: input.today,
    channel: input.channel,
    activeClientId,
    activeClientName,
    activeProjectId,
    activeProjectName,
    activeWorkspace: input.snapshot.activeWorkspace,
    activeResourceId: resource?.id,
    activeClient: activeClientId || activeClientName ? { id: activeClientId, name: activeClientName } : undefined,
    activeProject: activeProjectId || activeProjectName ? { id: activeProjectId, name: activeProjectName } : undefined,
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
    memories: input.memories,
    compactConversationSummary: input.compactConversationSummary,
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

  return {
    context,
    history,
    workSession,
    resolvedContext: {
      clientId: activeClientId,
      clientName: activeClientName,
      projectId: activeProjectId,
      projectName: activeProjectName,
    },
  };
}

export function resourceSessionMetadata(input: {
  resourceType?: string;
  resourceId?: string;
  resourceTitle?: string;
  resourceStatus?: string;
  resourceVersion?: number;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
}) {
  if (!input.resourceType || !input.resourceId) return {};
  return {
    ...input,
    workSessionId: `resource:${input.resourceType}:${input.resourceId}`,
  };
}
