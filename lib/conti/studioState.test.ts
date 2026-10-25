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

  it("preserves intentional blank shooting times and timeline overrides", () => {
    expect(normalizeContiStudioState({
      sceneMeta: { s1: { shootingTimeOverride: "" } },
      timelineOverrides: { "s1:once": { date: null, startTime: "13:20", endTime: null } },
    })).toMatchObject({
      sceneMeta: { s1: { shootingTimeOverride: "" } },
      timelineOverrides: { "s1:once": { date: null, startTime: "13:20", endTime: null } },
    });
  });

  it("normalizes shoot setup values and equipment checks", () => {
    expect(normalizeContiStudioState({
      shootSetup: { shootTypes: ["scene", "invalid", "profile", "scene"], hasVideo: true, profileStyle: "basic" },
      equipmentChecked: { "Sony a7R5": true, bad: "yes" },
    })).toMatchObject({
      shootSetup: { shootTypes: ["scene", "profile"], hasVideo: true, profileStyle: "basic" },
      equipmentChecked: { "Sony a7R5": true },
    });
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
    expect(deriveContiSchedule([{ id: "s1", sort: 0, name: "프로필", minutes: 15 }])[0]).toMatchObject({
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

  it("normalizes legacy start time into one schedule segment", () => {
    expect(normalizeContiStudioState({ scheduleStartTime: "10:30" }).scheduleSegments).toEqual([
      { id: "day-1", label: "1일차", startTime: "10:30", endTime: "18:00" },
    ]);
  });

  it("supports separate days, fixed-time scenes, and breaks", () => {
    const state = normalizeContiStudioState({
      scheduleSegments: [
        { id: "mon", label: "월", startTime: "09:00", endTime: "18:00" },
        { id: "tue", label: "화", startTime: "09:00", endTime: "18:00" },
      ],
      scheduleBlocks: [{ id: "lunch", segmentId: "mon", type: "break", label: "점심", minutes: 60, startTime: "12:00" }],
      fixedSceneTimes: { exterior: { segmentId: "mon", startTime: "17:30" } },
    });
    const rows = deriveContiSchedule([{ id: "exterior", sort: 0, name: "외관", minutes: 15 }], { studioState: state });
    expect(rows.find((row) => row.sceneId === "exterior")).toMatchObject({ startTime: "17:30", endTime: "17:45", locked: true });
    expect(rows.find((row) => row.type === "break")).toMatchObject({ startTime: "12:00", endTime: "13:00", locked: true });
  });

  it("keeps manual date and time overrides instead of recalculating them", () => {
    const state = normalizeContiStudioState({
      scheduleSegments: [{ id: "day-1", label: "월", date: "2026-10-26", startTime: "09:00", endTime: "18:00" }],
      timelineOverrides: {
        "s1:once": { date: "2026-10-27", startTime: "13:20", endTime: "13:50" },
        "s2:once": { startTime: null, endTime: null },
      },
    });
    const rows = deriveContiSchedule([
      { id: "s1", sort: 0, name: "프로필", minutes: 15 },
      { id: "s2", sort: 1, name: "진료", minutes: 20 },
    ], { studioState: state });
    expect(rows[0]).toMatchObject({ date: "2026-10-27", startTime: "13:20", endTime: "13:50" });
    expect(rows[1].startTime).toBeUndefined();
    expect(rows[1].endTime).toBeUndefined();
  });
});

describe("Conti scene visual library", () => {
  it("prefers a matching controlled asset and falls back to neutral", () => {
    expect(resolveSceneVisual({ name: "근골격 초음파" }).sceneKey).toBe("ultrasound");
    expect(resolveSceneVisual({ name: "특수 장면" }).sceneKey).toBe("neutral");
  });
});
