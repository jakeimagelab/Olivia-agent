export type ConversationEntityLike = {
  type: string;
  id: string;
  name?: string;
  lastMentionedAt: string;
};

export type EntityAliasLike = { type: string; id: string; name: string };

// 메시지 전처리 결과 — 원문에서 어떤 부분을 무엇으로 치환했는지 남긴다(로그/디버깅용,
// 82절 "개발 로깅"에 해당).
export type ResolutionApplied = {
  matchedText: string;
  resolvedName: string;
  kind: "alias" | "referent";
};

export type ResolveContextInput = {
  activeClientId?: string;
  activeClientName?: string;
  activeProjectId?: string;
  activeProjectName?: string;
  aliases?: Record<string, EntityAliasLike>;
  recentEntities?: ConversationEntityLike[];
};
