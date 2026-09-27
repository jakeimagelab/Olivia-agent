import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { isClientScopedExecutionRequest } from "@/lib/olivia/v2/executionIntent";

export type ClientTargetSource = "screen" | "conversation" | "explicit";

export type ClientProjectContextLink = {
  clientId?: string;
  clientName?: string;
  clientSelectedAt?: string;
  clientSource?: ClientTargetSource;
  projectId?: string;
  projectName?: string;
};

export type ClientProjectContextConflict = {
  screen: ClientProjectContextLink;
  recent: ClientProjectContextLink;
};

export type TrustedClientProjectContext = ClientProjectContextLink & {
  clientConflict?: ClientProjectContextConflict;
};

type ConversationHistoryRow = {
  role?: unknown;
  metadata?: unknown;
  created_at?: unknown;
};

const GENERIC_TARGET_WORDS = new Set([
  "이",
  "그",
  "저",
  "이거",
  "그거",
  "이것",
  "그것",
  "아까",
  "방금",
  "현재",
  "지금",
  "최근",
  "저번",
  "지난",
  "이번",
  "고객",
  "병원",
  "프로젝트",
]);

const CONTEXT_RECENCY_AMBIGUITY_MS = 60_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function timestamp(value: unknown): number | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasClientTarget(link: ClientProjectContextLink | undefined): link is ClientProjectContextLink {
  return Boolean(link?.clientId || link?.clientName);
}

function sameClient(left: ClientProjectContextLink, right: ClientProjectContextLink) {
  if (left.clientId && right.clientId) return left.clientId === right.clientId;
  return Boolean(left.clientName && right.clientName && left.clientName === right.clientName);
}

function withSource(link: ClientProjectContextLink | undefined, source: ClientTargetSource): ClientProjectContextLink | undefined {
  if (!hasClientTarget(link)) return undefined;
  return { ...link, clientSource: link.clientSource || source };
}

export function extractExplicitClientHint(message: string): string | undefined {
  const value = message.trim();
  const match = value.match(
    /^(.{1,50}?)\s+(?=견적(?:서)?|계약(?:서)?|콘티|스토리보드|워크플로(?:우)?|셀렉\s*갤러리|고객\s*갤러리)/i,
  );
  if (!match?.[1]) return undefined;

  const hint = match[1].trim().replace(/\s+/g, " ");
  const words = hint.split(" ");
  if (words.length > 0 && words.every((word) => GENERIC_TARGET_WORDS.has(word))) {
    return undefined;
  }
  return hint || undefined;
}

export function recentClientCandidateNames(context: OliviaContextSnapshot, limit = 3) {
  return Array.from(new Set(
    (context.recentEntities ?? [])
      .filter((entity) => entity.type === "client" && entity.name)
      .map((entity) => String(entity.name)),
  )).slice(-limit);
}

export function clientTargetQuestion(context: OliviaContextSnapshot, what: string) {
  const candidates = recentClientCandidateNames(context);
  const hint = candidates.length ? `\n최근: ${candidates.join(" · ")}` : "";
  return `어떤 고객의 ${what}인가요?${hint}`;
}

export function clientTargetConflictQuestion(input: {
  message: string;
  conflict: ClientProjectContextConflict;
}) {
  const what = /견적/.test(input.message) ? "견적서" : /계약/.test(input.message) ? "계약서" : "작업";
  const recentName = input.conflict.recent.clientName || "방금 대화한 고객";
  const screenName = input.conflict.screen.clientName || "현재 화면의 고객";
  return `${what}를 처리할 대상이 두 가지로 보여요.\n1. ${recentName} — 방금까지 대화한 대상\n2. ${screenName} — 지금 화면에 열린 고객\n어느 쪽인가요?`;
}

/**
 * 최근 대화에서 실제로 도구가 연결한 고객만 복원한다. 사용자 메시지 metadata에는 현재 화면
 * snapshot이 매번 복사되므로 보지 않는다 — 그 값을 읽으면 화면 대상이 다시 대화 대상으로
 * 위장되는 순환이 생긴다.
 */
export function recentClientProjectContextFromHistory(rows: readonly ConversationHistoryRow[]): ClientProjectContextLink | undefined {
  for (const row of [...rows].reverse()) {
    if (row.role !== "assistant") continue;
    const metadata = record(row.metadata);
    const clientId = text(metadata.clientId);
    const clientName = text(metadata.clientName) || text(metadata.hospitalName);
    if (!clientId && !clientName) continue;
    return {
      clientId,
      clientName,
      projectId: text(metadata.projectId),
      projectName: text(metadata.projectName),
      clientSelectedAt: text(row.created_at),
      clientSource: "conversation",
    };
  }
  return undefined;
}

export function requireClientTarget(
  context: OliviaContextSnapshot,
  explicitName: string | undefined,
  what: string,
): { ok: true; clientName: string } | { ok: false; message: string } {
  const clientName = explicitName?.trim() || context.activeClientName;
  if (clientName) return { ok: true, clientName };
  return { ok: false, message: clientTargetQuestion(context, what) };
}

/**
 * 화면 선택과 대화에서 마지막으로 확정된 대상을 함께 본다. 오래된 프론트는 선택 시각을
 * 보내지 않으므로 그 경우는 기존처럼 화면을 우선해 조용한 동작 변경을 피한다.
 */
export function resolveTrustedClientProjectContext(input: {
  message: string;
  snapshot: OliviaContextSnapshot;
  explicit?: ClientProjectContextLink;
  recent?: ClientProjectContextLink;
}): TrustedClientProjectContext {
  const explicit = withSource(input.explicit, "explicit");
  if (explicit) {
    return {
      ...explicit,
      // 기존 동작 호환: 명시 고객만 있고 프로젝트가 없는 화면 명령은 현재 프로젝트를 유지한다.
      projectId: explicit.projectId || input.snapshot.activeProjectId,
      projectName: explicit.projectName || input.snapshot.activeProjectName,
    };
  }

  const screen = withSource({
    clientId: input.snapshot.activeClientId,
    clientName: input.snapshot.activeClientName,
    clientSelectedAt: input.snapshot.activeClientSelectedAt,
    clientSource: input.snapshot.activeClientSource,
    projectId: input.snapshot.activeProjectId,
    projectName: input.snapshot.activeProjectName,
  }, "screen");
  const recent = withSource(input.recent, "conversation");

  if (!screen) {
    // 기존 규칙: 고객 종속 mutation은 화면 대상 없이 오래된 대화 대상만으로 실행하지 않는다.
    return isClientScopedExecutionRequest(input.message)
      ? { clientId: undefined, clientName: undefined, projectId: undefined, projectName: undefined }
      : (recent ?? {});
  }
  if (!recent || sameClient(screen, recent)) return screen;

  const screenAt = timestamp(screen.clientSelectedAt);
  const recentAt = timestamp(recent.clientSelectedAt);
  // 구버전 브라우저는 activeClientSelectedAt이 없다. 기존 화면 우선 동작을 유지한다.
  if (screenAt === undefined || recentAt === undefined) return screen;

  if (Math.abs(screenAt - recentAt) < CONTEXT_RECENCY_AMBIGUITY_MS) {
    return { clientConflict: { screen, recent } };
  }
  return recentAt > screenAt ? recent : screen;
}

export function shouldRequireClientSelection(input: {
  message: string;
  resolved: TrustedClientProjectContext;
}) {
  if (input.resolved.clientConflict) return true;
  if (!isClientScopedExecutionRequest(input.message)) return false;
  if (input.resolved.clientId) return false;
  if (extractExplicitClientHint(input.message)) return false;
  return true;
}
