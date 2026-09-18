import { describe, it, expect } from "vitest";
import { createStreamingScriptGuard, detectAbnormalScript, isWellFormedHistoryText } from "@/lib/olivia/output/scriptSanitizer";

// 코드 요청서 — Olivia 채팅 안정성. 한국어 응답에 섞여 들어온 아랍어/히브리어/키릴/데바나가리 등
// "이상 문자"를 감지하되, 정상적인 한국어+영어 혼용(URL/코드/브랜드명/한자 소량)은 절대 걸러내지
// 않아야 한다(false positive 금지).

describe("detectAbnormalScript — 이상 스크립트가 섞이면 즉시 감지한다", () => {
  const badCases: Array<[string, string]> = [
    ["안녕하세요 مرحبا 반갑습니다", "Arabic"],
    ["결과는 שלום 입니다", "Hebrew"],
    ["작업을 привет 완료했어요", "Cyrillic"],
    ["일정을 नमस्ते 확인했어요", "Devanagari"],
  ];
  for (const [text, label] of badCases) {
    it(`${label} 혼입 시 clean:false`, () => {
      const result = detectAbnormalScript(text);
      expect(result.clean).toBe(false);
      expect(result.offendingRanges.some((r) => r.script === label)).toBe(true);
    });
  }

  it("제어문자가 섞이면 clean:false", () => {
    const withControlChar = "정상 텍스트 중간에" + String.fromCharCode(0x0b) + "제어문자";
    const result = detectAbnormalScript(withControlChar);
    expect(result.clean).toBe(false);
    expect(result.offendingRanges.some((r) => r.script === "control")).toBe(true);
  });

  it("한 글자만 섞여도 감지한다(비율 계산 없이 zero-tolerance)", () => {
    const result = detectAbnormalScript("정상적인 한국어 문장입니다 п");
    expect(result.clean).toBe(false);
  });
});

describe("detectAbnormalScript — 정상적인 한국어/영어 혼용은 false positive 없이 통과한다", () => {
  const goodCases: string[] = [
    "네, 견적서를 생성했어요.",
    "https://olivia.photoclinic.kr/quote 링크를 확인해주세요.",
    "DSC_0142.jpg 파일을 RAW 폴더에서 찾았어요.",
    "const result = await fetch('/api/quote') 같은 코드 예시입니다.",
    "포토클리닉 — 2026년 8월 20일 촬영 일정입니다.",
    "PhotoClinic Mobile 1500px 프로그램을 다운로드하세요.",
    "환자분의 病歷(병력) 정보를 확인했습니다.",
    "AI 컷 정리 & RAW 셀렉 기능을 열었어요.",
  ];
  for (const text of goodCases) {
    it(`"${text.slice(0, 30)}..." -> clean:true`, () => {
      expect(detectAbnormalScript(text).clean).toBe(true);
    });
  }

  it("빈 문자열은 clean:true", () => {
    expect(detectAbnormalScript("").clean).toBe(true);
  });
});

describe("isWellFormedHistoryText — 모델에게 재전송하기 전 걸러야 할 과거 메시지", () => {
  it("빈 문자열/공백만 있으면 false", () => {
    expect(isWellFormedHistoryText("")).toBe(false);
    expect(isWellFormedHistoryText("   ")).toBe(false);
  });

  it("정상적인 한국어 응답은 true", () => {
    expect(isWellFormedHistoryText("네, 일정 3건을 확인했어요.")).toBe(true);
  });

  it("4000자를 넘는 거대한 덤프는 false", () => {
    expect(isWellFormedHistoryText("가".repeat(4001))).toBe(false);
  });

  it("raw JSON 에러 객체는 false", () => {
    expect(isWellFormedHistoryText('{"error":"PGRST116 relation not found","code":500}')).toBe(false);
  });

  it("스택트레이스가 섞이면 false", () => {
    expect(isWellFormedHistoryText("실패했습니다\n  at Object.<anonymous> (route.ts:120:15)")).toBe(false);
  });

  it("이상 스크립트가 섞인 과거 메시지는 false", () => {
    expect(isWellFormedHistoryText("결과는 привет 입니다")).toBe(false);
  });
});
