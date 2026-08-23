import type { ConversationEntityLike, ResolveContextInput } from "@/lib/olivia/intelligence/types";

// "2번"/"두 번째" 같은 위치 지시어는 여기서 안 다룬다 — lib/olivia/naturalLanguageNumbers.ts의
// parseShotPosition + toolExecutor.ts의 resolveContiShot이 이미 "현재 콘티" 안에서 처리한다
// (7절 우선순위표의 selectedEntity/activeResource 단계에 해당, 이미 동작 중). 이 resolver는
// 그 위 단계 — "화면엔 없지만 대화에서 최근에 다룬 고객/프로젝트"만 보완한다.
const CLIENT_REFERENT_PATTERNS = [/그\s*병원/, /그\s*고객/, /거기/, /그\s*쪽/];
const PROJECT_REFERENT_PATTERNS = [/그\s*프로젝트/, /그\s*건/];
const GENERIC_REFERENT_PATTERNS = [/아까\s*그?거/, /방금\s*전\s*거/, /방금\s*그?거/, /이거/, /그거/, /저거/, /그것도/];

export type ReferentResolution = {
  matchedText: string;
  resolvedName: string;
  entity: { type: string; id: string; name: string };
};

function mostRecentByType(entities: ConversationEntityLike[] | undefined, type: string): ConversationEntityLike | undefined {
  if (!entities) return undefined;
  for (let i = entities.length - 1; i >= 0; i--) {
    if (entities[i].type === type) return entities[i];
  }
  return undefined;
}

function mostRecentNamed(entities: ConversationEntityLike[] | undefined): ConversationEntityLike | undefined {
  if (!entities) return undefined;
  for (let i = entities.length - 1; i >= 0; i--) {
    if (entities[i].name) return entities[i];
  }
  return undefined;
}

// "그 병원"/"이거"/"아까 거" 같은 지시어를 최근 언급된 실명으로 풀 수 있으면 하나 돌려준다.
// 확신 없으면(이름이 있는 최근 엔티티도, activeClient도 없으면) null — 원문 그대로 두고
// LLM이 기존 방식대로(컨텍스트 참고해서 대답하거나 되묻거나) 처리하게 한다.
export function resolveReferent(text: string, context: ResolveContextInput): ReferentResolution | null {
  for (const pattern of CLIENT_REFERENT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const recentClient = mostRecentByType(context.recentEntities, "client");
    const name = recentClient?.name || context.activeClientName;
    const id = recentClient?.id || context.activeClientId;
    if (name && id) {
      return { matchedText: match[0], resolvedName: name, entity: { type: "client", id, name } };
    }
  }

  for (const pattern of PROJECT_REFERENT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const recentProject = mostRecentByType(context.recentEntities, "project");
    const name = recentProject?.name || context.activeProjectName;
    const id = recentProject?.id || context.activeProjectId;
    if (name && id) {
      return { matchedText: match[0], resolvedName: name, entity: { type: "project", id, name } };
    }
  }

  for (const pattern of GENERIC_REFERENT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const recent = mostRecentNamed(context.recentEntities);
    if (recent?.name) {
      return { matchedText: match[0], resolvedName: recent.name, entity: { type: recent.type, id: recent.id, name: recent.name } };
    }
    if (context.activeClientName && context.activeClientId) {
      return {
        matchedText: match[0],
        resolvedName: context.activeClientName,
        entity: { type: "client", id: context.activeClientId, name: context.activeClientName },
      };
    }
  }

  return null;
}

export function applyReferentRewrite(
  text: string,
  context: ResolveContextInput
): { text: string; applied: { matchedText: string; resolvedName: string }[] } {
  const resolution = resolveReferent(text, context);
  if (!resolution) return { text, applied: [] };
  const rewritten = text.replace(resolution.matchedText, resolution.resolvedName);
  return { text: rewritten, applied: [{ matchedText: resolution.matchedText, resolvedName: resolution.resolvedName }] };
}
