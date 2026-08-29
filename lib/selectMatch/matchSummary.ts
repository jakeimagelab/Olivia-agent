// 셀렉/RAW 매칭 완료 후 채팅에 남기는 결정론적(비-LLM) 요약 텍스트 — client_task 블록 자체는
// messageText()가 text 블록만 다음 턴 모델 입력으로 넘기기 때문에 모델에게 보이지 않는다.
// "한 장 왜 안됐어?" 같은 팔로우업에 답할 수 있으려면 이 텍스트가 대화 기록에 남아 있어야 한다.
export function buildMatchSummaryText(selected: number, matched: number, missing: number, missingNames: string[]): string {
  const base = `셀렉 매칭을 완료했어요. 선택 ${selected}장 중 ${matched}장은 RAW를 찾아 Selected_RAW 폴더로 복사했고, ${missing}장은 RAW를 찾지 못했어요.`;
  if (missing === 0) return base;
  const shown = missingNames.slice(0, 10);
  const list = shown.map((n) => `- ${n}`).join("\n");
  const more = missingNames.length > 10 ? `\n...외 ${missingNames.length - 10}개` : "";
  return `${base}\n\n못 찾은 파일:\n${list}${more}`;
}
