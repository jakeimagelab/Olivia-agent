const SYSTEM_SUBJECT = /(시스템|연결|헤르메스|hermes|mcp|맥\s*스튜디오|mac\s*studio|워커|worker|nas|워크스테이션|workstation|에이전트스테이션|agentstation|올리비아)/i;
const DIAGNOSTIC_ACTION = /(상태|점검|진단|확인|문제|원인|왜|안\s*돼|안됨|작동|보고)/i;

/**
 * Hermes가 고장 난 순간에도 동작해야 하므로 모델 Intent가 아니라 서버에서 보수적으로 판정한다.
 * 일반 업무의 "왜 안 돼?"를 가로채지 않도록 시스템 대상을 함께 말한 요청만 직접 진단한다.
 */
export function isSystemStatusChatRequest(message: string): boolean {
  const normalized = message.normalize("NFC").trim();
  if (!normalized) return false;
  if (SYSTEM_SUBJECT.test(normalized) && DIAGNOSTIC_ACTION.test(normalized)) return true;
  return /^(?:지금\s*)?(?:시스템\s*)?(?:뭐가|무엇이)\s*문제(?:야|인지|인가요?)?\s*(?:확인|점검|보고)?(?:해\s*줘|해주세요|해줘요)?[?.!\s]*$/i.test(normalized)
    || /^(?:지금\s*)?(?:시스템\s*)?문제(?:가|는)?\s*(?:뭔지|무엇인지|어딘지)\s*(?:확인|점검|보고)(?:해\s*줘|해주세요|해줘요)?[?.!\s]*$/i.test(normalized);
}
