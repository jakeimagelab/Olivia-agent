import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { isClientScopedExecutionRequest } from "@/lib/olivia/v2/executionIntent";

export type ClientProjectContextLink = {
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
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

export function requireClientTarget(
  context: OliviaContextSnapshot,
  explicitName: string | undefined,
  what: string,
): { ok: true; clientName: string } | { ok: false; message: string } {
  const clientName = explicitName?.trim() || context.activeClientName;
  if (clientName) return { ok: true, clientName };
  return { ok: false, message: clientTargetQuestion(context, what) };
}

export function resolveTrustedClientProjectContext(input: {
  message: string;
  snapshot: OliviaContextSnapshot;
  explicit?: ClientProjectContextLink;
  recent?: ClientProjectContextLink;
}): ClientProjectContextLink {
  const scopedExecution = isClientScopedExecutionRequest(input.message);
  return {
    clientId: input.explicit?.clientId
      || input.snapshot.activeClientId
      || (!scopedExecution ? input.recent?.clientId : undefined),
    clientName: input.explicit?.clientName
      || input.snapshot.activeClientName
      || (!scopedExecution ? input.recent?.clientName : undefined),
    projectId: input.explicit?.projectId
      || input.snapshot.activeProjectId
      || (!scopedExecution ? input.recent?.projectId : undefined),
    projectName: input.explicit?.projectName
      || input.snapshot.activeProjectName
      || (!scopedExecution ? input.recent?.projectName : undefined),
  };
}

export function shouldRequireClientSelection(input: {
  message: string;
  resolved: ClientProjectContextLink;
}) {
  if (!isClientScopedExecutionRequest(input.message)) return false;
  if (input.resolved.clientId) return false;
  if (extractExplicitClientHint(input.message)) return false;
  return true;
}
