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
  it("문장 속에 섞여 있어도 부분 문자열로 잡아낸다", () => {
    expect(resolveTemporalExpression("내일 일정 보여줘", runtime)).toMatchObject({ kind: "date", date: "2026-08-15" });
    expect(resolveTemporalExpression("다음주 일정 알려줘", runtime)).toMatchObject({ kind: "range", start: "2026-08-17", end: "2026-08-23" });
  });
  it("지난달 15일 → 절대 날짜", () => {
    expect(resolveTemporalExpression("지난달 15일", runtime)).toMatchObject({ kind: "date", date: "2026-07-15" });
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
  it("모레 날짜 뭐야? → 직접 응답", () => {
    const result = resolveDeterministicResponse("모레 날짜 뭐야?", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain("2026년 8월 16일");
  });
  it("어제 며칠이었어? → 직접 응답", () => {
    const result = resolveDeterministicResponse("어제 며칠이었어?", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain("2026년 8월 13일");
  });
  it("다음주 월요일 무슨 요일이야? → 명시적 재확인이면 요일도 답한다", () => {
    const result = resolveDeterministicResponse("다음주 월요일 무슨 요일이야?", runtime, emptyContext);
    expect(result?.routeDecision).toBe("RUNTIME_QUERY");
    expect(result?.text).toContain("월요일");
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
  it("일정 열어줘 → /calendar open(짧은 별칭이라도 여는 동사 뒤 완전일치면 허용)", () => {
    const result = resolveDeterministicResponse("일정 열어줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/calendar" }]);
  });
  it("여는 동사 없이 기능 이름만(고객관리) → 완전일치면 허용", () => {
    const result = resolveDeterministicResponse("고객관리", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/clients" }]);
  });
});

// 2026-08-29 사용자 리포트: "셀렉매칭 하자"/"셀렉매칭"처럼 /select-match의 등록 별칭과 겹치는
// 문장이 resolveNavigationCapability의 완전일치 경로로 새서 검증 없이 페이지 이동으로
// 확정됐다(N5류 "여는 동사 없이 기능 이름만" 완전일치 허용 규칙과 정확히 같은 매커니즘). 이
// 도메인만 예외적으로 RUN(Inline Tool 실행)을 OPEN(페이지 이동)보다 우선한다.
describe("Deterministic Router — Select/RAW Match RUN 의도 우선(GPT 미호출)", () => {
  it("사진 셀렉해서 RAW 매칭해야 해 → 채팅 안에서 바로 실행", () => {
    const result = resolveDeterministicResponse("사진 셀렉해서 RAW 매칭해야 해", runtime, emptyContext);
    expect(result?.routeDecision).toBe("SELECT_MATCH_RUN_INTENT");
    expect(result?.uiActions[0]).toMatchObject({ type: "OPEN_CLIENT_TASK", task: "select_match" });
  });
  it("셀렉매칭 하자 → 채팅 안에서 바로 실행", () => {
    const result = resolveDeterministicResponse("셀렉매칭 하자", runtime, emptyContext);
    expect(result?.routeDecision).toBe("SELECT_MATCH_RUN_INTENT");
  });
  it("여는 동사 없이 \"셀렉매칭\"만 있어도 페이지 이동이 아니라 RUN — 다른 기능(N5 고객관리류)과 다른 예외", () => {
    const result = resolveDeterministicResponse("셀렉매칭", runtime, emptyContext);
    expect(result?.routeDecision).toBe("SELECT_MATCH_RUN_INTENT");
  });
  it("매칭만 입력해도 RUN", () => {
    const result = resolveDeterministicResponse("매칭", runtime, emptyContext);
    expect(result?.routeDecision).toBe("SELECT_MATCH_RUN_INTENT");
  });
  it("셀렉매칭 페이지 열어줘 → \"페이지\" 명시 시 여전히 OPEN(페이지 이동)", () => {
    const result = resolveDeterministicResponse("셀렉매칭 페이지 열어줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/select-match" }]);
  });
  it("RAW 매칭 화면 보여줘 → \"화면\" 명시 시 여전히 OPEN", () => {
    const result = resolveDeterministicResponse("RAW 매칭 화면 보여줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/select-match" }]);
  });
});

// PHASE 2(견적서 Chat-native Workflow) 스펙 조사 중 발견: lib/toolNav.ts의 /quote 별칭 목록에
// "견적서"/"견적"/"견적 만들어줘"가 그대로 들어 있어 셀렉/매칭과 똑같은 버그 패턴이 재현된다.
// 다만 견적은 hospitalName을 문장에서 뽑아야 해서 완전 결정론적으로 create_quote를 바로
// 실행할 수는 없다 — 여기서는 "페이지 이동으로 단정하지 않고 GPT에게 넘기는지"만 확인한다
// (resolveDeterministicResponse가 null을 반환하면 GPT+tool 판단 경로로 넘어간다).
describe("Deterministic Router — 견적 생성 RUN 의도 시 페이지 이동 억제(GPT로 위임)", () => {
  it("여는 동사 없이 \"견적\"만 있어도 페이지 이동으로 단정하지 않는다(GPT에게 위임)", () => {
    expect(resolveDeterministicResponse("견적", runtime, emptyContext)).toBeNull();
  });
  it("\"견적서\"만 있어도 마찬가지", () => {
    expect(resolveDeterministicResponse("견적서", runtime, emptyContext)).toBeNull();
  });
  it("완전일치 별칭 \"견적 만들어줘\"도 페이지 이동으로 단정하지 않는다", () => {
    expect(resolveDeterministicResponse("견적 만들어줘", runtime, emptyContext)).toBeNull();
  });
  it("견적서 페이지 열어줘 → \"페이지\" 명시 시 여전히 OPEN(회귀)", () => {
    const result = resolveDeterministicResponse("견적서 페이지 열어줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/quote" }]);
  });
  it("견적 화면 보여줘 → \"화면\" 명시 시 여전히 OPEN(회귀)", () => {
    const result = resolveDeterministicResponse("견적 화면 보여줘", runtime, emptyContext);
    expect(result?.routeDecision).toBe("NAVIGATION_MATCH");
    expect(result?.uiActions).toEqual([{ type: "OPEN_FEATURE", href: "/quote" }]);
  });
});

describe("Ambiguity — 임의 실행 금지", () => {
  // 현재 등록된 실제 기능 데이터에서 "관리"는 "고객 포털 관리"(가장 긴 별칭)로 확정 매칭되는
  // 단일 승자가 있어(0.6 신뢰도) 진짜 동점 애매함은 아니다 — 그래도 완전 일치(1.0)가 아니므로
  // orchestrator는 이 결과를 그대로 GPT(open_feature 도구, 같은 로직 재사용)로 넘긴다.
  // "여러 후보가 동시에 걸리면 절대 하나를 임의로 골라 열지 않는다"는 계약 자체는
  // resolveNavigationCapability가 kind:"ambiguous"를 그대로 통과시키는 코드로 보장된다
  // (resolver.ts 참고) — 다만 지금 등록 데이터로는 실제 동점 사례를 재현할 자연스러운 입력이 없다.
  it("관리 열어줘 → 완전 일치가 아니므로 임의 실행하지 않고 GPT로 위임", () => {
    const result = resolveDeterministicResponse("관리 열어줘", runtime, emptyContext);
    expect(result).toBeNull();
  });
});

describe("Unknown feature — 지어내지 않는다", () => {
  // orchestrator 레벨에서는 "모른다"고 단정하지 않는다 — Registry에 없으면 그냥 null을 반환해
  // 기존 GPT+open_feature 경로가 "그런 기능은 없다"고 정확히 답하게 둔다(18, 44절).
  it("우주선 제어판 열어줘 → 결정적으로 처리하지 않고 GPT(open_feature 도구)로 넘긴다", () => {
    expect(resolveDeterministicResponse("우주선 제어판 열어줘", runtime, emptyContext)).toBeNull();
  });
  it("타임머신 실행 → 마찬가지로 GPT로 위임", () => {
    expect(resolveDeterministicResponse("타임머신 실행", runtime, emptyContext)).toBeNull();
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
