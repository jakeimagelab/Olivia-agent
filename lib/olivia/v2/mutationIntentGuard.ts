export type MutationIntentGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "MUTATION_INTENT_CONFLICT";
      reason: string;
    };

const CLIENT_TARGET_PATTERN = /(고객|고객등록|병원|의원|거래처)/i;
export const NEGATIVE_MUTATION_PATTERN = /(삭제|지워|없애|취소|해지|제거|빼|되돌려|롤백|중단|하지\s*마|안\s*할래)/i;
const DESTRUCTIVE_VERB_PATTERN = /(삭제|지워|제거|없애|고객에서\s*빼|등록\s*취소|빼줘|빼\s*줘)/i;
const PERMANENT_DELETE_PATTERN = /((완전히|영구(?:적)?으로?|db에서|데이터베이스에서).{0,12}(삭제|지워|제거|없애)|(삭제|지워|제거|없애).{0,12}(완전히|영구(?:적)?으로?|db에서|데이터베이스에서))/i;
const CLIENT_REGISTRATION_PATTERN = /(신규\s*고객|고객으로\s*등록|고객\s*등록|거래처\s*등록|고객으로\s*추가|신규\s*등록)/i;

export function hasClientDestructiveIntent(requestText?: string): boolean {
  const message = String(requestText ?? "");
  return CLIENT_TARGET_PATTERN.test(message) && DESTRUCTIVE_VERB_PATTERN.test(message);
}

export function hasClientRegistrationIntent(requestText?: string): boolean {
  const message = String(requestText ?? "");
  return !hasClientDestructiveIntent(message) && CLIENT_REGISTRATION_PATTERN.test(message);
}

export function hasClientPermanentDeleteIntent(requestText?: string): boolean {
  const message = String(requestText ?? "");
  return CLIENT_TARGET_PATTERN.test(message) && PERMANENT_DELETE_PATTERN.test(message);
}

export function validateMutationIntent(input: {
  requestText?: string;
  toolName: string;
}): MutationIntentGuardResult {
  const toolName = input.toolName.replaceAll(".", "_");

  if (hasClientPermanentDeleteIntent(input.requestText)
    && ["client_create", "apply_client_create", "client_update", "client_archive", "apply_client_archive"].includes(toolName)) {
    return {
      allowed: false,
      code: "MUTATION_INTENT_CONFLICT",
      reason: "완전 삭제는 연결된 프로젝트에 영향을 줄 수 있어 채팅에서 실행하지 않습니다. 고객관리 화면에서 확인 후 삭제하세요.",
    };
  }

  if (hasClientDestructiveIntent(input.requestText) && ["client_create", "apply_client_create", "client_update"].includes(toolName)) {
    return {
      allowed: false,
      code: "MUTATION_INTENT_CONFLICT",
      reason: "고객 삭제 요청을 고객 생성이나 수정 작업으로 바꿔 실행할 수 없습니다.",
    };
  }

  if (hasClientRegistrationIntent(input.requestText) && ["client_archive", "apply_client_archive"].includes(toolName)) {
    return {
      allowed: false,
      code: "MUTATION_INTENT_CONFLICT",
      reason: "신규 고객 등록 요청을 고객 보관 작업으로 바꿔 실행할 수 없습니다.",
    };
  }

  return { allowed: true };
}
