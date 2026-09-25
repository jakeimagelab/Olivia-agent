const TOOL_ACTION_PATTERN = /(만들어|생성|수정|바꿔|추가|삭제|지워|빼|공개|발송|보내|견적|계약|콘티|이동|옮겨|넘겨|완료\s*처리|답장|초안|저장|승인|적용|잡아|등록|넣어|예약|켜줘|꺼줘|닫아줘|분리|분류|해\s*줘|맞추면\s*돼|그렇게\s*해)/i;
const FAST_COMMAND_PATTERN = /(열어|보여|닫아|전체\s*화면|일정|프로젝트|상태|이메일|메일|미팅|회의|갤러리|브리핑|오늘|[\d,.]+\s*(으로|로))/i;
const UI_EXECUTION_PATTERN = /(열어줘|열어|보여줘|띄워줘|바꿔줘|바꿔|전환해|이동해|가\s*줘|거기로\s*가|다시\s*열어|그걸로\s*바꿔|닫아줘|닫아|창\s*닫기|최소화|최대화|전체\s*화면)/i;
const SHORT_CONFIRMATION_PATTERN = /^\s*(응|네|예|맞아|그래|좋아|오케이|진행해|확인|승인|해\s*줘|그걸로|이대로|그렇게|종일로)(?:\s*(?:해|해\s*줘|잡아\s*줘))?(?:\s*[.!])?\s*$/i;
const TOOL_UNAVAILABLE_OR_PROMISE_PATTERN = /(할\s*수\s*없|연결(?:되어\s*)?있지\s*않|연결되지\s*않|기능(?:이|을)?\s*(?:없|사용할\s*수\s*없)|도구(?:가|를)?\s*(?:없|찾지\s*못)|(?:처리|등록|추가|저장|수정|삭제|열기|이동|분리|분류)(?:할게요|하겠습니다)|진행(?:할게요|하겠습니다))/i;
const CLIENT_SCOPED_RESOURCE_PATTERN = /(견적(?:서)?|계약(?:서)?|콘티|스토리보드|워크플로(?:우)?|셀렉\s*갤러리|고객\s*갤러리|선금|잔금|특약|납품\s*(?:조건|기한|방식)|촬영\s*항목)/i;
const CLIENT_SCOPED_ACTION_PATTERN = /(만들어|생성|수정|바꿔|변경|추가|삭제|지워|공개|발송|저장|승인|완료\s*처리|적용|등록|넣어|해\s*줘|그렇게\s*해)/i;

export function hasOliviaToolActionLanguage(message: string): boolean {
  return TOOL_ACTION_PATTERN.test(message.trim());
}

export function hasOliviaFastCommandLanguage(message: string): boolean {
  return FAST_COMMAND_PATTERN.test(message.trim());
}

export function isOliviaMutationIntent(message: string): boolean {
  return hasOliviaToolActionLanguage(message) || SHORT_CONFIRMATION_PATTERN.test(message);
}

export function isOliviaUiExecutionIntent(message: string): boolean {
  return UI_EXECUTION_PATTERN.test(message);
}

export function isClientScopedExecutionRequest(message: string): boolean {
  return CLIENT_SCOPED_RESOURCE_PATTERN.test(message) && CLIENT_SCOPED_ACTION_PATTERN.test(message);
}

export function isHermesToolMiss(input: {
  message: string;
  responseText: string;
  toolCallCount: number;
}): boolean {
  if (input.toolCallCount > 0) return false;
  if (!isOliviaMutationIntent(input.message) && !isOliviaUiExecutionIntent(input.message)) return false;
  return TOOL_UNAVAILABLE_OR_PROMISE_PATTERN.test(input.responseText);
}
