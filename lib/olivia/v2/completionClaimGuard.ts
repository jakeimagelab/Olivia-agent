export type CompletionClaimGroup = "open" | "create" | "update" | "send" | "remove" | "failure";
type ActionCompletionClaimGroup = Exclude<CompletionClaimGroup, "failure">;

export type ExecutedTool = {
  name: string;
  success: boolean;
};

const ACTION_GROUP_ORDER: ActionCompletionClaimGroup[] = ["open", "create", "update", "send", "remove"];
const GROUP_ORDER: CompletionClaimGroup[] = [...ACTION_GROUP_ORDER, "failure"];

const TOOL_PATTERNS: Record<ActionCompletionClaimGroup, RegExp> = {
  open: /^(?:open_|select_|preview_)|_open$|^navigate/,
  create: /^(?:create_|add_|start_|generate_|link_new_)|_create$|_wizard$/,
  update: /^(?:update_|apply_|set_|save_|rebalance_|resolve_|retry_|advance_)|_update$/,
  send: /^(?:send_|publish_|request_|download_|share_|deliver_)|_publish$|_pdf$/,
  remove: /^(?:delete_|remove_|archive_|cancel_|defer_)|_archive$|_delete$|_remove$/,
};

const CLAIM_STEMS: Record<ActionCompletionClaimGroup, string[]> = {
  open: ["열었", "띄웠", "띄워\s*드렸"],
  create: ["만들었", "생성했", "작성했", "등록했", "추가했"],
  update: ["저장했", "수정했", "변경했", "바꿨", "적용했", "업데이트했", "반영했", "갱신했"],
  send: ["보냈", "발송했", "전달했", "전송했", "공유했", "다운로드했", "발행했"],
  remove: ["삭제했", "지웠", "제거했", "없앴", "보관했", "취소했", "해지했"],
};

const FAILURE_TEXT: Record<CompletionClaimGroup, string> = {
  open: "열지 못했어. 다시 해볼까?",
  create: "만들지 못했어. 다시 해볼까?",
  update: "저장하지 못했어. 다시 해볼까?",
  send: "보내지 못했어. 다시 해볼까?",
  remove: "처리하지 못했어. 다시 해볼까?",
  failure: "실행 결과를 확인하지 못했어요.",
};

// "견적서 생성 중 오류가 나서 저장되지 않았어요"처럼, 도구를 전혀 호출하지 않은
// 상태에서 실행 실패를 사실처럼 말하는 문장만 막는다. 실제 실패 도구 기록이 있으면
// 서버 결과를 그대로 보여야 하므로 이 검사는 tool 0회일 때만 쓴다.
const UNVERIFIED_FAILURE_CLAIM_PATTERN = /(?:견적서|문서|작업|저장|생성|등록).{0,40}(?:오류가?\s*(?:났|발생했)|실패했(?:어요|습니다)?|(?:저장|생성|등록)되지\s*않았)/;

const ENDING = "(?:어요|습니다|어|다|네요|음)";

function normalizeToolName(name: string): string {
  return name.replace(/^mcp_olivia_/, "").replaceAll(".", "_").trim();
}

function supportedGroups(executedTools: readonly ExecutedTool[]): Set<ActionCompletionClaimGroup> {
  const supported = new Set<ActionCompletionClaimGroup>();
  for (const tool of executedTools) {
    if (!tool.success) continue;
    const name = normalizeToolName(tool.name);
    for (const group of ACTION_GROUP_ORDER) {
      if (TOOL_PATTERNS[group].test(name)) supported.add(group);
    }
  }
  return supported;
}

function claimGroups(fragment: string): ActionCompletionClaimGroup[] {
  const trimmed = fragment.trim();
  if (!trimmed || /\?+["'”’)}\]]*$/.test(trimmed)) return [];
  const sentence = trimmed.replace(/[.!]+["'”’)}\]]*$/, "").trim();
  if (!sentence || /(?:보여\s*드렸|표시했)\s*(?:어요|습니다|어|다|네요|음)$/.test(sentence)) return [];

  return ACTION_GROUP_ORDER.filter((group) => {
    const stems = CLAIM_STEMS[group].join("|");
    // 문장 끝의 종결형만 완료 주장으로 본다. "열었다고 말했어"처럼 뒤에 인용·자백이
    // 이어지는 표현은 여기서 자연스럽게 제외된다.
    return new RegExp(`(?:${stems})${ENDING}$`).test(sentence);
  });
}

function isUnverifiedFailureClaim(fragment: string): boolean {
  const trimmed = fragment.trim();
  if (!trimmed || /\?+["'”’)}\]]*$/.test(trimmed)) return false;
  return UNVERIFIED_FAILURE_CLAIM_PATTERN.test(trimmed);
}

function splitFragments(text: string): string[] {
  return text.match(/[^.!?\n]+(?:[.!?]+|(?=\n|$))|\n+/g) ?? (text ? [text] : []);
}

function cleanJoinedText(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function enforceCompletionClaims(input: {
  text: string;
  executedTools: readonly ExecutedTool[];
}): { text: string; unsupported: CompletionClaimGroup[] } {
  const supported = supportedGroups(input.executedTools);
  const unsupported = new Set<CompletionClaimGroup>();
  const kept: string[] = [];

  for (const fragment of splitFragments(input.text)) {
    if (/^\n+$/.test(fragment)) {
      kept.push(fragment);
      continue;
    }
    if (input.executedTools.length === 0 && isUnverifiedFailureClaim(fragment)) {
      unsupported.add("failure");
      continue;
    }
    const claims = claimGroups(fragment);
    const missing = claims.filter((group) => !supported.has(group));
    if (missing.length === 0) {
      kept.push(fragment);
      continue;
    }
    for (const group of missing) unsupported.add(group);
  }

  const orderedUnsupported = GROUP_ORDER.filter((group) => unsupported.has(group));
  if (orderedUnsupported.length === 0) return { text: input.text, unsupported: [] };

  const remaining = cleanJoinedText(kept.join(""));
  const replacements = orderedUnsupported.map((group) => FAILURE_TEXT[group]);
  return {
    text: [remaining, ...replacements].filter(Boolean).join("\n"),
    unsupported: orderedUnsupported,
  };
}
