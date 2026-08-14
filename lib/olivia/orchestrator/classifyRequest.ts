import type { OliviaRequestClassKind } from "./types";

// 관측용(로그) 4분류 — 실제 라우팅 분기는 handleRequest.ts의 결정적 리졸버들이 담당한다.
// 이건 "왜 GPT로 넘어갔는지" 나중에 로그로 추적하기 위한 참고 라벨일 뿐이다(설계 문서 8, 49-50절).
const NAVIGATION_HINT = /(열어줘|열어봐|열어|보여줘|보여봐|보여|실행해줘|실행해|실행|켜줘|켜|시작해줘|시작해|시작)$/;
const ACTION_HINT = /(만들어|생성|수정|바꿔|추가|삭제|빼|공개|발송|이동|넘겨|완료\s*처리|답장|초안|저장|승인)/;
const QUERY_HINT = /(알려줘|뭐야|뭐예요|있어|있나요|몇|언제|어디|누구|왜|뭔가요)/;

export function classifyRequestKind(message: string): OliviaRequestClassKind {
  const t = message.trim();
  if (NAVIGATION_HINT.test(t)) return "NAVIGATION";
  if (ACTION_HINT.test(t)) return "DATA_ACTION";
  if (QUERY_HINT.test(t)) return "DATA_QUERY";
  return "CONVERSATION";
}
