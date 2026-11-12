import { describe, expect, it } from "vitest";
import {
  normalizePersonSelectRawMatchSource,
  resolvePersonSelectRawMatchPathPlan,
  resolveIndividualRawMatchTargets,
  resolveSharedRawMatchTargets,
  type PersonSelectRawImage,
} from "@/lib/person-select/rawMatch";
import { canPersonSelectReviewerFinalize } from "@/lib/person-select/reviewerPermissions";

function image(id: string): PersonSelectRawImage {
  return { id, originalFileName: `${id}.JPG`, sourceRelPath: `JPG/${id}.JPG` };
}

describe("person select RAW match targets", () => {
  it("separates a nested JPG folder from the same-root shooting folder", () => {
    expect(resolvePersonSelectRawMatchPathPlan(
      "root-0/1026_푸른안과/JPG전체/프로필",
      "프로젝트",
    )).toEqual({
      sourcePath: "root-0/1026_푸른안과/JPG전체/프로필",
      shootingPath: "root-0/1026_푸른안과",
      outputPath: "root-0/1026_푸른안과/Selected_RAW/프로젝트",
      derivedFromJpgFolder: true,
    });
  });

  it("recognizes an NFD Korean JPG folder without changing the storage root", () => {
    const source = "root-2/1026_푸른안과/JPG전체".normalize("NFD") + "/프로필".normalize("NFD");
    const result = resolvePersonSelectRawMatchPathPlan(source, "프로젝트");
    expect(result.shootingPath.normalize("NFC")).toBe("root-2/1026_푸른안과");
    expect(result.outputPath.normalize("NFC")).toBe("root-2/1026_푸른안과/Selected_RAW/프로젝트");
    expect(result.shootingPath.startsWith("root-2/")).toBe(true);
  });

  it("keeps legacy folders without a known JPG segment backward compatible", () => {
    expect(resolvePersonSelectRawMatchPathPlan("root-1/학교전달", "<이름>")).toEqual({
      sourcePath: "root-1/학교전달",
      shootingPath: "root-1/학교전달",
      outputPath: "root-1/학교전달/Selected_RAW/<이름>",
      derivedFromJpgFolder: false,
    });
  });

  it("defaults an omitted source to submitted", () => {
    expect(normalizePersonSelectRawMatchSource(undefined)).toBe("submitted");
    expect(normalizePersonSelectRawMatchSource("current")).toBe("current");
  });

  it("includes 52 unsubmitted individual choices for current source", () => {
    const choices = Array.from({ length: 52 }, (_, index) => ({ personId: "person", image: image(`photo-${index}`) }));
    const result = resolveIndividualRawMatchTargets({
      source: "current",
      people: [{ id: "person", displayName: "정연호", submittedAt: null }],
      choices,
    });
    expect(result.targets).toHaveLength(52);
    expect(result.submittedSelectedCount).toBe(0);
    expect(result.currentUnsubmittedCount).toBe(52);
  });

  it("keeps submitted source limited to submitted people", () => {
    const result = resolveIndividualRawMatchTargets({
      people: [
        { id: "submitted", displayName: "고객", submittedAt: "2026-11-11T00:00:00Z" },
        { id: "draft", displayName: "매니저", submittedAt: null },
      ],
      choices: [
        { personId: "submitted", image: image("a") },
        { personId: "draft", image: image("b") },
      ],
    });
    expect(result.targets.map((target) => target.id)).toEqual(["a"]);
  });

  it("deduplicates the union of two shared reviewers", () => {
    const result = resolveSharedRawMatchTargets({
      source: "current",
      reviewers: [
        { id: "a", displayName: "정연호", active: true },
        { id: "b", displayName: "클라이언트", active: true },
      ],
      submittedByReviewer: new Map(),
      draftByReviewer: new Map([
        ["a", [image("one"), image("shared")]],
        ["b", [image("shared"), image("two")]],
      ]),
    });
    expect(result.targets.map((target) => target.id)).toEqual(["one", "shared", "two"]);
    expect(result.currentUnsubmittedCount).toBe(3);
  });

  it("uses a submitted selection when a shared reviewer has no draft", () => {
    const result = resolveSharedRawMatchTargets({
      source: "current",
      reviewers: [{ id: "legacy", displayName: "기존 공동 셀렉", active: true }],
      submittedByReviewer: new Map([["legacy", [image("submitted")]]]),
      draftByReviewer: new Map(),
    });
    expect(result.targets.map((target) => target.id)).toEqual(["submitted"]);
    expect(result.submittedSelectedCount).toBe(1);
    expect(result.currentUnsubmittedCount).toBe(0);
  });
});

describe("legacy shared reviewer finalization", () => {
  it("always allows a legacy reviewer to finalize the shared selection", () => {
    expect(canPersonSelectReviewerFinalize({ is_legacy: true, can_finalize: null })).toBe(true);
    expect(canPersonSelectReviewerFinalize({ is_legacy: false, can_finalize: null })).toBe(false);
    expect(canPersonSelectReviewerFinalize({ is_legacy: true, can_finalize: false })).toBe(true);
    expect(canPersonSelectReviewerFinalize({ is_legacy: false, can_finalize: true })).toBe(true);
  });
});
