import { describe, it, expect } from "vitest";
import { buildOliviaRuntimeContext } from "@/lib/olivia/runtime/buildRuntimeContext";
import { resolveTemporalExpression } from "@/lib/olivia/runtime/temporalResolver";
import { resolveDeterministicResponse } from "@/lib/olivia/orchestrator/handleRequest";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

// [CODEX 실행 요청서 — OLIVIA CORE 재구성] 45절 Eval Suite. 실행 시각에 따라 결과가 흔들리지
// 않도록 기준 시각을 2026-08-14(금요일) 12:00 KST로 고정한다. 48절에 따라 문장 wording이 아니라
// 실제로 어떤 라우트로 처리됐는지(routeDecision/uiActions)를 검사한다.
const FIXED_NOW = new Date("2026-08-14T03:00:00.000Z"); // UTC 03:00 == KST 12:00
const runtime = buildOliviaRuntimeContext(FIXED_NOW);
const emptyContext: OliviaContextSnapshot = { recentActions: [], revision: 0 };

describe("Runtime Truth", () => {
  it("고정 시각 기준 오늘 날짜/요일/타임존이 정확하다", () => {
    expect(runtime.todayISO).toBe("2026-08-14");
    expect(runtime.weekdayKo).toBe("금요일");
    expect(runtime.timezone).toBe("Asia/Seoul");
    expect(runtime.localTime).toBe("12:00");
  });

  it("자정 근처(23:59 KST)에도 달력 날짜가 밀리지 않는다", () => {
    const lateNight = buildOliviaRuntimeContext(new Date("2026-08-14T14:59:00.000Z")); // 23:59 KST
    expect(lateNight.todayISO).toBe("2026-08-14");
  });

  it("자정 직후(00:00 KST)에도 hour가 24가 아니라 00이다", () => {
    const midnight = buildOliviaRuntimeContext(new Date("2026-08-13T15:00:00.000Z")); // 00:00 KST 8/14
    expect(midnight.todayISO).toBe("2026-08-14");
    expect(midnight.localTime).toBe("00:00");
  });
});

describe("Temporal Resolver — 절대 날짜/범위 변환", () => {
  const dateCases: Array<[string, string]> = [
    ["내일", "2026-08-15"],
    ["모레", "2026-08-16"],
    ["어제", "2026-08-13"],
    ["오늘", "2026-08-14"],
    ["다음주 월요일", "2026-08-17"],
    ["이번주 금요일", "2026-08-14"],
    ["지난주 월요일", "2026-08-03"],
    ["8월 20일", "2026-08-20"],
    ["다음달 3일", "2026-09-03"],
  ];
  for (const [input, expected] of dateCases) {
    it(`"${input}" → ${expected}`, () => {
      const result = resolveTemporalExpression(input, runtime);
      expect(result).toMatchObject({ kind: "date", date: expected });
    });
  }

  const rangeCases: Array<[string, string, string]> = [
    ["이번달", "2026-08-01", "2026-08-31"],
    ["다음달", "2026-09-01", "2026-09-30"],
    ["지난달", "2026-07-01", "2026-07-31"],
    ["이번주", "2026-08-10", "2026-08-16"],
    ["다음주", "2026-08-17", "2026-08-23"],
  ];
  for (const [input, start, end] of rangeCases) {
    it(`"${input}" → ${start} ~ ${end}`, () => {
      const result = resolveTemporalExpression(input, runtime);
      expect(result).toMatchObject({ kind: "range", start, end });
    });
  }

  it("이미 지난 '일'만 있는 표현은 다음 달로 넘어간다(5일 < 오늘 14일)", () => {
    expect(resolveTemporalExpression("5일", runtime)).toMatchObject({ kind: "date", date: "2026-09-05" });
  });
  it("아직 안 지난 '일'만 있는 표현은 이번 달 그대로(20일 >= 오늘 14일)", () => {
    expect(resolveTemporalExpression("20일", runtime)).toMatchObject({ kind: "date", date: "2026-08-20" });
  });
  it("날짜 표현이 없으면 null", () => {
    expect(resolveTemporalExpression("견적서 만들어줘", runtime)).toBeNull();
    expect(resolveTemporalExpression("프로필 50으로", runtime)).toBeNull();
  });
});

describe("Deterministic Router — Runtime Query (T1-T5, GPT 미호출)", () => {
  it("T1: 오늘 며칠이야? → 실제 오늘 날짜로 직접 응답", () => {
    const result = resolveDeterministicResponse("오늘 며칠이야?", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain("2026년 8월 14일");
  });
  it("T2: 오늘 무슨 요일이야? → 실제 요일로 직접 응답", () => {
    const result = resolveDeterministicResponse("오늘 무슨 요일이야?", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain("금요일");
  });
  it("T2b: 지금 몇 시야? → 직접 응답", () => {
    const result = resolveDeterministicResponse("지금 몇 시야?", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain(runtime.localTime);
  });
  it("T3: 내일 날짜 뭐야? → 실제 다음 날짜로 직접 응답", () => {
    const result = resolveDeterministicResponse("내일 날짜 뭐야?", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain("2026년 8월 15일");
  });
  it("T4: 다음주 월요일 언제야? → 올바른 절대 날짜로 직접 응답", () => {
    const result = resolveDeterministicResponse("다음주 월요일 언제야?", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain("2026년 8월 17일");
  });
  it("T5: 오늘 날짜 뭐야, 무슨 요일이야? → 날짜+요일 함께 응답", () => {
    const result = resolveDeterministicResponse("오늘 날짜랑 요일 알려줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain("2026년 8월 14일");
    expect(result?.text).toContain("금요일");
  });

  it("일정/미팅이 섞인 질문은 직답하지 않고 GPT+캘린더 도구로 넘긴다", () => {
    expect(resolveDeterministicResponse("오늘 일정 몇 개야?", runtime, emptyContext)).toBeNull();
    expect(resolveDeterministicResponse("내일 미팅 몇 시야?", runtime, emptyContext)).toBeNull();
  });
});

describe("Deterministic Router — Navigation (N1-N5, GPT 미호출)", () => {
  it("N1: 프롬프터 열어줘 → /prompter 즉시 실행", () => {
    const result = resolveDeterministicResponse("프롬프터 열어줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/prompter" }]);
  });
  it("N2: 텔레프롬프터 실행 → 동일 기능", () => {
    const result = resolveDeterministicResponse("텔레프롬프터 실행", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/prompter" }]);
  });
  it("N2b: 대본 화면 띄워줘 → 동일 기능", () => {
    const result = resolveDeterministicResponse("대본 화면 띄워줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/prompter" }]);
  });
  it("N3: 고객관리 보여줘 → /clients open", () => {
    const result = resolveDeterministicResponse("고객관리 보여줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/clients" }]);
  });
  it("N4: CRM 열어 → /clients open", () => {
    const result = resolveDeterministicResponse("CRM 열어", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/clients" }]);
  });
  it("N5: 사진분류 열어줘 → /photo-sorting open", () => {
    const result = resolveDeterministicResponse("사진분류 열어줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/photo-sorting" }]);
  });
  it("업무일지 열어줘 → /work-journal open", () => {
    const result = resolveDeterministicResponse("업무일지 열어줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/work-journal" }]);
  });
  it("메모 열어줘 → /memo open", () => {
    const result = resolveDeterministicResponse("메모 열어줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/memo" }]);
  });
});

describe("Ambiguity — 임의 실행 금지", () => {
  it("관리 열어줘 → 후보가 여러 개면 하나를 임의로 열지 않고 되묻는다", () => {
    const result = resolveDeterministicResponse("관리 열어줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_AMBIGUOUS");
    expect(result?.uiActions).toEqual([]);
  });
});

describe("Unknown feature — 지어내지 않는다", () => {
  it("우주선 제어판 열어줘 → 결정적으로 처리하지 않고 GPT(open_feature 도구)로 넘긴다", () => {
    // orchestrator 레벨에서는 "모른다"고 단정하지 않는다 — Registry에 없으면 그냥 null을 반환해
    // 기존 GPT+open_feature 경로가 "그런 기능은 없다"고 정확히 답하게 둔다(18, 44절).
    expect(resolveDeterministicResponse("우주선 제어판 열어줘", runtime, emptyContext)).toBeNull();
  });
});

describe("Context / Quote / Conti / Calendar / Conversation — 결정적으로 가로채지 않고 GPT+기존 Tool로 위임", () => {
  const passthroughCases = [
    "히어산부인과 견적 보여줘",
    "그 병원 콘티 보여줘",
    "프로필 50으로",
    "2번 컷 빼",
    "오늘 일정 보여줘",
    "다음주 일정",
    "우리 홈페이지 문의가 왜 안 들어올까?",
    "다음 달 촬영이 너무 많은데 어떻게 하지?",
    "더힐피부과 콘티 찾아줘",
    "테스트클리닉 현재 단계 처리해줘",
  ];
  for (const message of passthroughCases) {
    it(`"${message}" → 결정적 처리 없음(null), 기존 GPT+Tool 경로 유지`, () => {
      expect(resolveDeterministicResponse(message, runtime, emptyContext)).toBeNull();
    });
  }
});
