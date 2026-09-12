import { describe, expect, it } from "vitest";
import { deriveContiChecklist, parsePreparationText } from "./deriveChecklist";
import { deriveContiSchedule } from "./deriveSchedule";
import { createDefaultContiStudioState, normalizeContiStudioState } from "./studioState";
import { resolveSceneVisual } from "./sceneVisualLibrary";

describe("Conti Studio state", () => {
  it("normalizes missing and unsafe persisted values", () => {
    expect(normalizeContiStudioState(null)).toEqual(createDefaultContiStudioState());
    expect(normalizeContiStudioState({
      fieldCardSize: "huge",
      scheduleStartTime: "28:90",
      sceneMeta: { s1: { visual: { source: "ai", imageUrl: "https://provider.example/image.png" } } },
    })).toEqual(createDefaultContiStudioState());
  });

  it("keeps supported state and same-origin visual URLs", () => {
    expect(normalizeContiStudioState({
      fieldCardSize: "large",
      scheduleStartTime: "10:30",
      checklistCompleted: { "prep-a": true },
      sceneMeta: { s1: { cameraAngle: "정면", visual: { source: "library", imageUrl: "/scene.svg" } } },
    })).toMatchObject({ fieldCardSize: "large", scheduleStartTime: "10:30", sceneMeta: { s1: { cameraAngle: "정면" } } });
  });
});
describe("Conti checklist derivation", () => {
  it("splits and deduplicates preparation while retaining linked scenes", () => {
    expect(parsePreparationText("가운, 젤 · 초음파 기기\n가운")).toEqual(["가운", "젤", "초음파 기기", "가운"]);
    const state = createDefaultContiStudioState();
    const items = deriveContiChecklist([
      { id: "s1", preparation_text: "가운, 젤" },
      { id: "s2", preparation_text: "가운 · 환자 역할" },
    ], state);
    expect(items.map((item) => item.label)).toEqual(["가운", "젤", "환자 역할"]);
    expect(items[0].linkedSceneIds).toEqual(["s1", "s2"]);
  });
});

describe("Conti schedule derivation", () => {
  it("keeps duration-only rows when a start time is absent", () => {
    expect(deriveContiSchedule([{ id: "s1", sort: 0, name: "프로필", minutes: 15 }])[0]).toEqual({
      sceneId: "s1", order: 1, name: "프로필", location: "장소 미정", minutes: 15,
    });
  });

  it("recalculates consecutive times in sorted scene order", () => {
    const rows = deriveContiSchedule([
      { id: "s2", sort: 1, name: "상담", minutes: 10 },
      { id: "s1", sort: 0, name: "프로필", minutes: 15 },
    ], "10:00");
    expect(rows.map((row) => [row.sceneId, row.startTime, row.endTime])).toEqual([
      ["s1", "10:00", "10:15"],
      ["s2", "10:15", "10:25"],
    ]);
  });
});

describe("Conti scene visual library", () => {
  it("prefers a matching controlled asset and falls back to neutral", () => {
    expect(resolveSceneVisual({ name: "근골격 초음파" }).sceneKey).toBe("ultrasound");
    expect(resolveSceneVisual({ name: "특수 장면" }).sceneKey).toBe("neutral");
  });
});
