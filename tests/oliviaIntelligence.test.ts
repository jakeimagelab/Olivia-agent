import { beforeEach, describe, expect, it } from "vitest";
import { deriveAlias, applyAliasRewrite, findAliasMatches } from "@/lib/olivia/intelligence/aliasResolver";
import { resolveReferent, applyReferentRewrite } from "@/lib/olivia/intelligence/referentResolver";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

describe("deriveAlias — 병원명 접미사를 떼서 짧은 별칭을 만든다", () => {
  it("흔한 접미사를 떼서 별칭을 만든다", () => {
    expect(deriveAlias("히어산부인과")).toBe("히어");
    expect(deriveAlias("미소로한의원")).toBe("미소로");
  });

  it("접미사가 아닌 부분(지점명 등)으로는 별칭을 만들지 않는다", () => {
    // "더힐피부과신사점"은 "점"으로 끝나 목록의 어떤 접미사와도 안 맞는다(오타 사례의 원인이기도 함).
    expect(deriveAlias("더힐피부과신사점")).toBeNull();
  });

  it("접미사를 떼도 2글자 미만이면 별칭을 만들지 않는다", () => {
    expect(deriveAlias("A의원")).toBeNull();
  });

  it("접미사가 없으면 별칭을 만들지 않는다", () => {
    expect(deriveAlias("포토클리닉스튜디오")).toBeNull();
  });
});

describe("applyAliasRewrite — 등록된 별칭을 정식 명칭으로 치환한다", () => {
  const aliases = {
    "히어": { type: "client", id: "c1", name: "히어산부인과" },
    "미소로": { type: "client", id: "c2", name: "미소로한의원" },
  };

  it("문장 속 별칭을 정식 명칭으로 바꾼다", () => {
    const result = applyAliasRewrite(aliases, "히어 콘티 찾아");
    expect(result.text).toBe("히어산부인과 콘티 찾아");
    expect(result.applied).toEqual([{ matchedText: "히어", resolvedName: "히어산부인과" }]);
  });

  it("별칭이 없으면 원문을 그대로 둔다", () => {
    const result = applyAliasRewrite(aliases, "르셀청담 콘티 찾아");
    expect(result.text).toBe("르셀청담 콘티 찾아");
    expect(result.applied).toEqual([]);
  });

  it("별칭 맵이 비어있어도 에러 없이 원문을 돌려준다", () => {
    expect(applyAliasRewrite({}, "히어 콘티 찾아").text).toBe("히어 콘티 찾아");
    expect(applyAliasRewrite(undefined, "히어 콘티 찾아").text).toBe("히어 콘티 찾아");
  });

  it("더 긴 별칭이 있으면 그걸 우선한다(짧은 별칭이 부분 매치되지 않게)", () => {
    const overlapping = {
      "히어": { type: "client", id: "c1", name: "히어산부인과" },
      "히어산": { type: "client", id: "c3", name: "히어산악회" },
    };
    const matches = findAliasMatches(overlapping, "히어산 모임");
    expect(matches).toHaveLength(1);
    expect(matches[0].alias).toBe("히어산");
  });
});

describe("resolveReferent — 지시어를 최근 언급된 실명으로 해석한다", () => {
  it("'그 병원'을 최근 언급된 고객으로 해석한다", () => {
    const context = {
      recentEntities: [
        { type: "client", id: "c1", name: "히어산부인과", lastMentionedAt: "2026-08-17T00:00:00Z" },
      ],
    };
    const resolution = resolveReferent("그 병원 견적 보여줘", context);
    expect(resolution).toMatchObject({ matchedText: "그 병원", resolvedName: "히어산부인과" });
  });

  it("'아까 거'를 최근 언급된 엔티티(타입 무관)로 해석한다", () => {
    const context = {
      recentEntities: [
        { type: "client", id: "c1", name: "히어산부인과", lastMentionedAt: "2026-08-17T00:00:00Z" },
        { type: "project", id: "p1", name: "브랜드 촬영", lastMentionedAt: "2026-08-17T00:01:00Z" },
      ],
    };
    const resolution = resolveReferent("아까 거 다시 보여줘", context);
    expect(resolution).toMatchObject({ matchedText: "아까 거", resolvedName: "브랜드 촬영" });
  });

  it("recentEntities가 없으면 activeClientName으로 폴백한다", () => {
    const context = { activeClientId: "c1", activeClientName: "히어산부인과" };
    const resolution = resolveReferent("그거 열어", context);
    expect(resolution).toMatchObject({ matchedText: "그거", resolvedName: "히어산부인과" });
  });

  it("해석할 단서가 전혀 없으면 null을 돌려준다(LLM에게 넘김)", () => {
    expect(resolveReferent("그거 열어", {})).toBeNull();
  });

  it("지시어가 없는 문장은 손대지 않는다", () => {
    expect(resolveReferent("히어산부인과 콘티 찾아", { activeClientName: "다른병원" })).toBeNull();
  });

  it("applyReferentRewrite는 매칭된 부분만 치환한다", () => {
    const context = { activeClientId: "c1", activeClientName: "히어산부인과" };
    const result = applyReferentRewrite("그 병원 콘티 찾아", context);
    expect(result.text).toBe("히어산부인과 콘티 찾아");
  });
});

describe("oliviaContextStore — 최근 언급 엔티티와 별칭 자동 등록", () => {
  beforeEach(() => useOliviaContextStore.getState().clearContext());

  it("setClient가 recentEntities에 기록되고 별칭이 자동 등록된다", () => {
    useOliviaContextStore.getState().setClient("c1", "히어산부인과");
    const state = useOliviaContextStore.getState();
    expect(state.recentEntities).toContainEqual(
      expect.objectContaining({ type: "client", id: "c1", name: "히어산부인과" })
    );
    expect(state.aliases["히어"]).toEqual({ type: "client", id: "c1", name: "히어산부인과" });
  });

  it("같은 엔티티를 다시 열면 중복 없이 최신으로 갱신된다", () => {
    useOliviaContextStore.getState().setClient("c1", "히어산부인과");
    useOliviaContextStore.getState().setProject("p1", "브랜드 촬영");
    useOliviaContextStore.getState().setClient("c1", "히어산부인과");
    const { recentEntities } = useOliviaContextStore.getState();
    expect(recentEntities.filter((e) => e.type === "client" && e.id === "c1")).toHaveLength(1);
  });

  it("최근 10개까지만 유지한다", () => {
    for (let i = 0; i < 15; i++) {
      useOliviaContextStore.getState().rememberEntity({ type: "project", id: `p${i}`, name: `프로젝트${i}` });
    }
    expect(useOliviaContextStore.getState().recentEntities).toHaveLength(10);
  });
});
