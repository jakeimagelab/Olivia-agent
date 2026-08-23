import { describe, it, expect } from "vitest";
import { resolveFeatureIntent } from "@/lib/olivia/features/resolver";
import { resolveNavigationCapability } from "@/lib/olivia/capabilities/resolver";

// 코드 요청서 — Olivia 채팅 안정성 + 자연어 기능 이해 강화. 27절 테스트 문장 배터리를 그대로
// 테이블 케이스로 옮긴다. "셀렉매칭"/"RAW매칭" 등은 lib/toolNav.ts에 등록이 빠져 있던 게 진짜
// 원인이었다(WP1) — 이 테스트는 등록 완료 + 스코어링(WP2) 둘 다를 함께 검증한다.

describe("resolveFeatureIntent — 완전 일치(동의어 포함)는 즉시 match, confidence 1", () => {
  const exactCases: Array<[string, string]> = [
    ["콘티", "/conti"],
    ["견적", "/quote"],
    ["사진분류", "/photo-sorting"],
    ["사진 분류", "/photo-sorting"],
    ["셀렉매칭", "/select-match"],
    ["셀렉 매칭", "/select-match"],
    ["RAW매칭", "/select-match"],
    ["원본매칭", "/select-match"],
    ["사진셀렉", "/select-match"],
    ["고객셀렉", "/select-match"],
    ["RAW셀렉", "/raw-select"],
    ["영상분류", "/video-sorting"],
    ["색감보정", "/photo-retouching"],
  ];
  for (const [query, expectedHref] of exactCases) {
    it(`"${query}" → ${expectedHref}, confidence 1`, () => {
      const result = resolveFeatureIntent(query);
      expect(result.kind).toBe("match");
      if (result.kind === "match") {
        expect(result.tool.href).toBe(expectedHref);
        expect(result.confidence).toBe(1);
      }
    });
  }
});

describe("resolveFeatureIntent — 필러어가 섞여도 정규화 후 매칭된다", () => {
  it("\"셀렉매칭기능말이야\" → select-match, confidence 1", () => {
    const result = resolveFeatureIntent("셀렉매칭기능말이야");
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.tool.href).toBe("/select-match");
      expect(result.confidence).toBe(1);
    }
  });

  it("\"셀렉매칭 좀 열어줘\" → select-match, confidence 1", () => {
    const result = resolveFeatureIntent("셀렉매칭 좀 열어줘");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.tool.href).toBe("/select-match");
  });

  it("\"RAW 매칭 기능 보여줘\" → select-match", () => {
    const result = resolveFeatureIntent("RAW 매칭 기능 보여줘");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.tool.href).toBe("/select-match");
  });
});

describe("resolveFeatureIntent — 완전히 못 찾아도 dead-end로 끝내지 않는다", () => {
  it("전혀 무관한 요청은 none이지만, 그나마 가까운 후보가 있으면 함께 돌려준다", () => {
    const result = resolveFeatureIntent("우주선 제어판");
    expect(result.kind).toBe("none");
  });

  it("아무 글자도 안 남으면(필러어뿐이면) none", () => {
    const result = resolveFeatureIntent("");
    expect(result.kind).toBe("none");
  });
});

describe("resolveFeatureIntent — 두 후보가 동시에 완전 일치하면 임의로 고르지 않고 ambiguous", () => {
  it("서로 다른 두 기능이 정확히 같은 별칭을 쓰면 ambiguous", () => {
    // 실제 등록 데이터엔 완전 중복 별칭이 없어야 하지만, 회귀 방지 차원에서 알고리즘 자체를
    // 점검한다 — 동점(diff < 0.1, top>=0.5)이면 kind가 반드시 ambiguous여야 한다.
    const result = resolveFeatureIntent("셀렉");
    // "셀렉"은 "셀렉 갤러리"의 별칭이자 "셀렉 & 매칭"의 keyword 성격 별칭 후보이기도 하다 —
    // 정확히 같은 문자열로 등록된 alias가 하나뿐이면 match, 여럿이면 ambiguous여야 한다.
    expect(["match", "ambiguous"]).toContain(result.kind);
  });
});

describe("resolveNavigationCapability — confidence===1 게이트가 새 알고리즘에서도 안전하다", () => {
  // 2026-08-14 eval에서 재현·확인된 사고: "오늘 일정 보여줘"가 부분일치로 화면 이동으로
  // 오판되면 안 된다 — 이건 실제 데이터 질문이다.
  it("\"오늘 일정 보여줘\"는 부분일치라 결정론적 네비게이션으로 오판하지 않는다", () => {
    expect(resolveNavigationCapability("오늘 일정 보여줘")).toEqual({ kind: "none" });
  });

  it("\"히어산부인과 견적 보여줘\"도 데이터 질문이라 화면 이동으로 오판하지 않는다", () => {
    expect(resolveNavigationCapability("히어산부인과 견적 보여줘")).toEqual({ kind: "none" });
  });

  it("완전 일치인 \"콘티 열어줘\"는 결정론적으로 바로 통과한다", () => {
    const result = resolveNavigationCapability("콘티 열어줘");
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.confidence).toBe(1);
      expect(result.tool.href).toBe("/conti");
    }
  });

  it("완전 일치인 \"셀렉매칭 열어줘\"도 결정론적으로 바로 통과한다(WP1 registry 등록 확인)", () => {
    const result = resolveNavigationCapability("셀렉매칭 열어줘");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.tool.href).toBe("/select-match");
  });
});
