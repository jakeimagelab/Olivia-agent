import { describe, expect, it } from "vitest";
import { buildLibraryQueryText, buildReferenceBlock } from "@/lib/conti-library/promptBuilder";
import { capByDistinctDocument } from "@/lib/conti-library/search";
import type { ContiCaseSceneMatch } from "@/lib/conti-library/types";

function makeHit(overrides: Partial<ContiCaseSceneMatch>): ContiCaseSceneMatch {
  return {
    id: "scene-1",
    caseDocumentId: "doc-1",
    sceneName: "울쎄라 상담",
    sceneType: "consultation",
    department: "피부과",
    location: "상담실",
    action: "원장이 환자에게 설명",
    cameraAngle: "좌측 45도",
    direction: null,
    notes: null,
    clinicName: "글로리의원",
    fileName: "glory.pdf",
    similarity: 0.9,
    ...overrides,
  };
}

describe("buildLibraryQueryText", () => {
  it("진료과/촬영목적/특이사항을 결합한다", () => {
    expect(buildLibraryQueryText({ specialties: "피부과", purpose: "홈페이지 촬영", notes: "울쎄라" }))
      .toBe("피부과 · 홈페이지 촬영 · 울쎄라");
  });

  it("빈 값은 건너뛴다", () => {
    expect(buildLibraryQueryText({ specialties: "피부과", purpose: "", notes: undefined })).toBe("피부과");
  });
});

describe("buildReferenceBlock", () => {
  it("사례가 없으면 빈 문자열을 반환한다 (기존 프롬프트를 그대로 유지하기 위해)", () => {
    expect(buildReferenceBlock([])).toBe("");
  });

  it("사례가 있으면 요청서 16장의 지시문을 그대로 포함한다", () => {
    const block = buildReferenceBlock([makeHit({})]);
    expect(block).toContain("아래 사례들은 사용자가 과거 직접 작성하고 최종 확정한 콘티입니다");
    expect(block).toContain("새로운 장면은 기존 사례로 해결할 수 없는 경우에만 추가하십시오");
    expect(block).toContain("글로리의원");
    expect(block).toContain("울쎄라 상담");
  });
});

describe("capByDistinctDocument", () => {
  it("서로 다른 문서 수를 상한으로 제한한다", () => {
    const hits = [
      makeHit({ id: "s1", caseDocumentId: "doc-1" }),
      makeHit({ id: "s2", caseDocumentId: "doc-1" }),
      makeHit({ id: "s3", caseDocumentId: "doc-2" }),
      makeHit({ id: "s4", caseDocumentId: "doc-3" }),
      makeHit({ id: "s5", caseDocumentId: "doc-4" }),
    ];
    const capped = capByDistinctDocument(hits, 2);
    expect(capped.map((h) => h.id)).toEqual(["s1", "s2", "s3"]);
    expect(new Set(capped.map((h) => h.caseDocumentId)).size).toBe(2);
  });

  it("같은 문서 안에서는 순서(유사도 순)를 유지한 채 전부 남긴다", () => {
    const hits = [makeHit({ id: "s1", caseDocumentId: "doc-1" }), makeHit({ id: "s2", caseDocumentId: "doc-1" })];
    expect(capByDistinctDocument(hits, 5).map((h) => h.id)).toEqual(["s1", "s2"]);
  });
});
