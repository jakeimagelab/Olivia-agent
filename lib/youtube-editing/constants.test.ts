import { describe, expect, it } from "vitest";
import { estimateDurationSec, splitScriptIntoSentences } from "./constants";

describe("splitScriptIntoSentences", () => {
  it("마침표/물음표/느낌표 뒤에서 문장을 나눈다", () => {
    expect(splitScriptIntoSentences("오늘 그 범인을 잡아드리겠습니다. 코가 간지럽고 재채기가 나오나요? 저도 그랬어요!"))
      .toEqual(["오늘 그 범인을 잡아드리겠습니다.", "코가 간지럽고 재채기가 나오나요?", "저도 그랬어요!"]);
  });

  it("줄바꿈으로도 문장을 나눈다", () => {
    expect(splitScriptIntoSentences("첫 줄\n둘째 줄\n셋째 줄")).toEqual(["첫 줄", "둘째 줄", "셋째 줄"]);
  });

  it("빈 줄과 앞뒤 공백은 제거한다", () => {
    expect(splitScriptIntoSentences("  안녕하세요.  \n\n반갑습니다.  ")).toEqual(["안녕하세요.", "반갑습니다."]);
  });

  it("빈 대본은 빈 배열을 반환한다", () => {
    expect(splitScriptIntoSentences("")).toEqual([]);
  });
});

describe("estimateDurationSec", () => {
  it("공백을 제외한 글자 수를 기준으로 길이를 추정한다", () => {
    expect(estimateDurationSec("가나다라마바사아자차")).toBe(Math.round(10 / 4.3));
  });

  it("빈 문자열이어도 최소 1초를 반환한다", () => {
    expect(estimateDurationSec("")).toBe(1);
  });
});
