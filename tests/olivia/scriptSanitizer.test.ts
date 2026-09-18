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

// 코드 요청서(2026-09-18) 작업 A — 실시간 스트리밍 sliding-window 필터.
describe("createStreamingScriptGuard — 실시간 스트리밍 중 이상 문자 방어", () => {
  it("windowSize 이하로 쌓인 동안은 아무것도 내보내지 않는다", () => {
    const guard = createStreamingScriptGuard(40);
    expect(guard.push("안녕하세요")).toBe("");
    expect(guard.push(" 반갑습니다")).toBe("");
    expect(guard.isPoisoned()).toBe(false);
  });

  it("windowSize를 넘으면 초과분만 내보내고 꼬리는 계속 버퍼에 남긴다", () => {
    const guard = createStreamingScriptGuard(10);
    // 10자 버퍼 유지, 그 이전 문자만 방출.
    const released1 = guard.push("가나다라마바사아자차카타파하"); // 14자
    expect(released1).toBe("가나다라"); // 14 - 10 = 4자 방출
    expect(guard.isPoisoned()).toBe(false);
    const released2 = guard.push("A"); // 버퍼 11자 -> 1자 방출
    expect(released2).toBe("마");
  });

  it("정상 텍스트는 push 누적 + flush로 원문이 전부 재구성된다(유실 없음)", () => {
    const guard = createStreamingScriptGuard(5);
    const source = "이것은 정상적인 한국어 문장을 여러 delta로 쪼개 보내는 테스트입니다.";
    let rebuilt = "";
    for (const chunk of source.match(/.{1,3}/g) ?? []) {
      rebuilt += guard.push(chunk);
    }
    rebuilt += guard.flush();
    expect(rebuilt).toBe(source);
    expect(guard.isPoisoned()).toBe(false);
  });

  it("버퍼 안에서 이상 문자가 발견되면 poisoned로 전환되고 그 이후 아무것도 내보내지 않는다", () => {
    const guard = createStreamingScriptGuard(5);
    expect(guard.push("정상적인 텍스트")).not.toBe(""); // 윈도우 넘겨서 일부 방출
    expect(guard.isPoisoned()).toBe(false);
    const releasedWithAnomaly = guard.push("привет"); // 키릴 문자 포함
    expect(guard.isPoisoned()).toBe(true);
    expect(releasedWithAnomaly).toBe("");
    expect(guard.push("이후 정상 텍스트도 안 나간다")).toBe("");
    expect(guard.flush()).toBe("");
  });

  it("flush 시점에 버퍼 안에서 뒤늦게 이상 문자가 발견되면 poisoned로 전환한다", () => {
    const guard = createStreamingScriptGuard(40);
    guard.push("짧은 텍스트 привет"); // 40자 미만이라 push에서는 아직 방출 안 됨
    expect(guard.isPoisoned()).toBe(false);
    expect(guard.flush()).toBe("");
    expect(guard.isPoisoned()).toBe(true);
  });

  it("빈 delta는 무시한다", () => {
    const guard = createStreamingScriptGuard(5);
    expect(guard.push("")).toBe("");
    expect(guard.isPoisoned()).toBe(false);
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
