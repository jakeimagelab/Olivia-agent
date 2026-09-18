import { describe, expect, it } from "vitest";
import { resolveHermesDisplayText } from "@/lib/olivia/output/hermesDisplayText";

const base = {
  guardedResponse: false,
  anyLiveDeltaSent: true,
  liveStreamedText: "안녕하세요! 오늘 일정은 3건 있어요.",
  hermesText: "안녕하세요! 오늘 일정은 3건 있어요.",
  hermesRawText: "안녕하세요! 오늘 일정은 3건 있어요.",
  scriptGuardPoisoned: false,
  fallbackMessage: "답변을 정리하는 중에 문제가 있었어요. 다시 한 번 말씀해주시겠어요?",
};

describe("resolveHermesDisplayText — 실시간 스트리밍 후 최종 표시 텍스트 결정", () => {
  it("정상 케이스: 실시간으로 흘린 원문이 최종 텍스트와 같으면 그걸 쓰고 재전송하지 않는다", () => {
    const result = resolveHermesDisplayText(base);
    expect(result).toEqual({ finalDisplayText: base.liveStreamedText, alreadyFullyStreamed: true });
  });

  // 실제 E2E 테스트로 잡은 버그의 회귀 테스트 — Hermes가 finish_reason:"error"로 빈 응답을 내면
  // onTextDelta가 한 번도 안 불려서 liveStreamedText가 빈 문자열인 채로 남는데, hermesText가
  // (우연히, 도구 호출이 없어서) hermesRawText와 같아 "실시간으로 다 흘렸다"고 잘못 판단하면
  // 실제 응답("응답을 생성하지 못했습니다." 같은 안전한 fallback 문구)이 통째로 사라진다.
  it("[회귀] anyLiveDeltaSent가 false면 hermesText/hermesRawText가 같아도 빈 liveStreamedText를 쓰지 않는다", () => {
    const result = resolveHermesDisplayText({
      ...base,
      anyLiveDeltaSent: false,
      liveStreamedText: "",
      hermesText: "응답을 생성하지 못했습니다.",
      hermesRawText: "응답을 생성하지 못했습니다.",
    });
    expect(result).toEqual({ finalDisplayText: "응답을 생성하지 못했습니다.", alreadyFullyStreamed: false });
  });

  it("guarded 요청은 실시간 스트리밍을 신뢰하지 않는다(항상 hermesText, 재전송 필요)", () => {
    const result = resolveHermesDisplayText({ ...base, guardedResponse: true });
    expect(result).toEqual({ finalDisplayText: base.hermesText, alreadyFullyStreamed: false });
  });

  it("pending action/검증 템플릿으로 hermesText가 원문과 달라지면 재전송이 필요하다", () => {
    const result = resolveHermesDisplayText({
      ...base,
      hermesText: "[검증됨] 견적서를 생성했어요.",
      hermesRawText: "네, 견적서 생성 완료!",
    });
    expect(result).toEqual({ finalDisplayText: "[검증됨] 견적서를 생성했어요.", alreadyFullyStreamed: false });
  });

  it("이상 문자가 중간에 발견되면(poisoned) 이미 보인 텍스트 뒤에 fallback을 이어붙인다", () => {
    const result = resolveHermesDisplayText({ ...base, scriptGuardPoisoned: true });
    expect(result).toEqual({
      finalDisplayText: `${base.liveStreamedText}\n\n${base.fallbackMessage}`,
      alreadyFullyStreamed: true,
      additionalDeltaToSend: `\n\n${base.fallbackMessage}`,
    });
  });

  it("poisoned인데 아직 아무것도 안 흘렸으면(liveStreamedText 비어있음) fallback만 보낸다", () => {
    const result = resolveHermesDisplayText({
      ...base,
      liveStreamedText: "",
      hermesText: "",
      hermesRawText: "",
      scriptGuardPoisoned: true,
    });
    // liveStreamedText가 비어있으면 anyLiveDeltaSent도 보통 false겠지만, poisoned 분기는
    // streamedRawMatchesFinal이 참일 때만 도달하므로 anyLiveDeltaSent:true인 이 케이스도
    // 방어적으로 검증한다(빈 문자열 앞에 불필요한 개행을 붙이지 않는지).
    expect(result).toEqual({
      finalDisplayText: base.fallbackMessage,
      alreadyFullyStreamed: true,
      additionalDeltaToSend: base.fallbackMessage,
    });
  });
});
