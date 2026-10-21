import { describe, expect, it } from "vitest";
import {
  buildDefaultSceneRecommendations,
  parseContiSceneRecommendation,
} from "@/lib/conti/sceneRecommendations";

describe("conti scene recommendations", () => {
  it("provides pain-medicine-specific fallback scenes", () => {
    const recommendations = buildDefaultSceneRecommendations({
      specialty: "pain-medicine",
      existingSceneNames: [],
    });

    expect(recommendations.map((item) => item.name)).toEqual(expect.arrayContaining([
      "단체사진",
      "단체 하모니컷",
      "인포데스크 하모니컷",
      "C-ARM 신경차단술",
      "초음파 유도 주사치료",
      "통증 부위 진찰 · 설명",
    ]));
    expect(recommendations.every((item) => item.source === "default")).toBe(true);
    expect(recommendations.find((item) => item.name === "단체사진")?.groupName).toBe("단체");
    expect(recommendations.find((item) => item.name === "C-ARM 신경차단술")?.groupName).toBe("시술");
  });

  it("does not recommend a scene that already exists", () => {
    const recommendations = buildDefaultSceneRecommendations({
      specialty: "pain-medicine",
      existingSceneNames: ["단체사진", "단체 하모니컷", "인포데스크 하모니컷", "C-ARM 신경차단술"],
    });

    expect(recommendations.some((item) => item.name === "C-ARM 신경차단술")).toBe(false);
    expect(recommendations.some((item) => item.openingOrder !== undefined)).toBe(false);
  });

  it("uses the department taxonomy for other specialties", () => {
    const recommendations = buildDefaultSceneRecommendations({
      specialty: "dentistry",
      existingSceneNames: [],
    });

    expect(recommendations.map((item) => item.name)).toContain("일반치료");
    expect(recommendations.slice(0, 3).map((item) => item.name)).toEqual(["단체사진", "단체 하모니컷", "인포데스크 하모니컷"]);
  });

  it("sanitizes only supported scene fields", () => {
    expect(parseContiSceneRecommendation({
      name: " 초음파 시술 ",
      groupName: " 시술 ",
      minutes: 999,
      media: "unsupported",
      description: "설명",
      source: "default",
      ignored: "value",
    })).toEqual({
      name: "초음파 시술",
      groupName: "시술",
      keyword: "",
      description: "설명",
      minutes: 180,
      spaceText: "",
      peopleText: "",
      patientRoleText: "",
      preparationText: "",
      media: "photo",
      source: "default",
    });
    expect(parseContiSceneRecommendation({ name: "   " })).toBeNull();
  });

  it("forces the fixed opening scenes into the collective group", () => {
    expect(parseContiSceneRecommendation({
      name: "단체 하모니컷",
      groupName: "운동치료실",
      spaceText: "로비",
    })?.groupName).toBe("단체");
  });
});
