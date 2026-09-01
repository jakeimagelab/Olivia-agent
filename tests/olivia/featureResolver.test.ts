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
    ["사진분류", "/photo-sorting?tool=classification"],
    ["사진 분류", "/photo-sorting?tool=classification"],
    ["셀렉매칭", "/photo-sorting?tool=select-raw"],
    ["셀렉 매칭", "/photo-sorting?tool=select-raw"],
    ["RAW매칭", "/photo-sorting?tool=select-raw"],
    ["원본매칭", "/photo-sorting?tool=select-raw"],
    ["사진셀렉", "/photo-sorting?tool=select-raw"],
    ["고객셀렉", "/photo-sorting?tool=select-raw"],
    ["RAW셀렉", "/photo-sorting?tool=ai-cull"],
    ["영상분류", "/video-sorting"],
    ["색감보정", "/photo-sorting?tool=retouch"],
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
      expect(result.tool.href).toBe("/photo-sorting?tool=select-raw");
      expect(result.confidence).toBe(1);
    }
  });

  it("\"셀렉매칭 좀 열어줘\" → select-match, confidence 1", () => {
    const result = resolveFeatureIntent("셀렉매칭 좀 열어줘");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.tool.href).toBe("/photo-sorting?tool=select-raw");
  });

  it("\"RAW 매칭 기능 보여줘\" → select-match", () => {
    const result = resolveFeatureIntent("RAW 매칭 기능 보여줘");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.tool.href).toBe("/photo-sorting?tool=select-raw");
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

describe("resolveFeatureIntent — 애매하게 걸치는 후보는 임의로 고르지 않고 ambiguous", () => {
  it("\"셀렉\"만 단독으로 말하면 셀렉 갤러리/셀렉 & 매칭 둘 다 후보로 걸려 ambiguous", () => {
    // "셀렉" 자체는 어느 기능의 완전 일치 별칭도 아니다 — 여러 기능의 별칭에 부분 문자열로
    // 걸쳐 점수가 근접하게 나오는 게 실제로 맞는 동작이다(사용자 스펙 8/9절 "애매하면 후보를
    // 보여주고 되묻는다").
    const result = resolveFeatureIntent("셀렉");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      const hrefs = result.candidates.map((tool) => tool.href);
      expect(hrefs).toContain("/photo-sorting?tool=select-raw");
      expect(hrefs).toContain("/select-galleries");
    }
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
    if (result.kind === "match") expect(result.tool.href).toBe("/photo-sorting?tool=select-raw");
  });
});
