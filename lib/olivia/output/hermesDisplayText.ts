// 코드 요청서(2026-09-18) 작업 A — Hermes 응답을 실시간으로 흘렸을 때, 라운드가 끝난 뒤 실제로
// 화면/DB에 쓸 최종 텍스트를 무엇으로 할지 결정하는 순수 함수. app/api/olivia/v2/stream/
// route.ts의 useHermes 블록에서 직접 재현하기엔 로직이 복잡해(e2e 테스트로 실제 버그를 하나
// 잡았다 — "hermesText가 hermesResult.text와 우연히 같다"는 것만으로 liveStreamedText를
// 신뢰하면, onTextDelta가 이번 라운드에 한 번도 안 불렸을 때(예: Hermes가 finish_reason:"error"로
// 빈 응답을 낸 경우) 빈 문자열을 최종 텍스트로 써버려 실제 응답이 통째로 사라진다) 별도 함수로
// 뽑아 유닛 테스트로 그 경계 조건을 고정한다.
export type HermesDisplayTextInput = {
  guardedResponse: boolean;
  /** onTextDelta가 이번 라운드에 실제 내용으로 최소 한 번이라도 불렸는지 — 이게 false면
   *  liveStreamedText를 절대 신뢰하지 않는다(guardedResponse가 아니어도). */
  anyLiveDeltaSent: boolean;
  /** 지금까지 실시간으로 내보낸 텍스트를 그대로 이어붙인 것. */
  liveStreamedText: string;
  /** 최종적으로 화면/DB에 쓰여야 하는 텍스트(pending action prompt/검증 템플릿/Hermes 원문 중
   *  하나) — 기존 hermesText 계산 결과를 그대로 넘긴다. */
  hermesText: string;
  /** hermesText 계산의 재료가 된 Hermes 원문(hermesResult.text) — 이게 hermesText와 같아야만
   *  "이 라운드는 순수 원문 그대로 쓰였다"고 판단할 수 있다. */
  hermesRawText: string;
  /** sliding-window 필터가 이상 문자를 발견해 poisoned 상태로 전환됐는지. */
  scriptGuardPoisoned: boolean;
  /** poisoned일 때 이어붙일 안전한 대체 문구. */
  fallbackMessage: string;
};

export type HermesDisplayTextResult = {
  /** 화면/DB에 최종적으로 쓸 텍스트. */
  finalDisplayText: string;
  /** true면 이 라운드의 화면 표시는 실시간 스트리밍(및 poisoned 시 추가 delta)만으로 이미
   *  끝났다는 뜻 — 호출부는 flushTextAsDeltas()를 또 부르면 안 된다(중복 전송 방지). */
  alreadyFullyStreamed: boolean;
  /** poisoned로 전환됐을 때만 채워진다 — 호출부가 이 문자열을 추가 text_delta로 보내야 한다
   *  (이미 화면에 나간 실시간 원문 뒤에 이어붙이는 것). */
  additionalDeltaToSend?: string;
};

export function resolveHermesDisplayText(input: HermesDisplayTextInput): HermesDisplayTextResult {
  const streamedRawMatchesFinal = !input.guardedResponse
    && input.anyLiveDeltaSent
    && input.hermesText === input.hermesRawText;

  if (!streamedRawMatchesFinal) {
    return { finalDisplayText: input.hermesText, alreadyFullyStreamed: false };
  }

  if (input.scriptGuardPoisoned) {
    const finalDisplayText = input.liveStreamedText
      ? `${input.liveStreamedText}\n\n${input.fallbackMessage}`
      : input.fallbackMessage;
    const additionalDeltaToSend = input.liveStreamedText
      ? `\n\n${input.fallbackMessage}`
      : input.fallbackMessage;
    return { finalDisplayText, alreadyFullyStreamed: true, additionalDeltaToSend };
  }

  return { finalDisplayText: input.liveStreamedText, alreadyFullyStreamed: true };
}
