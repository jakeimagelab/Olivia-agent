import { describe, expect, it } from "vitest";
import { formatProjectMissionTitle, resolveShootingSchedule } from "./projectOverview";

describe("formatProjectMissionTitle", () => {
  it("does not repeat an identical client and project name", () => {
    expect(formatProjectMissionTitle("A", "A")).toBe("A");
  });

  it("does not repeat the client when the project already starts with it", () => {
    expect(formatProjectMissionTitle("A", "A 브랜드 촬영")).toBe("A 브랜드 촬영");
  });

  it("combines distinct names", () => {
    expect(formatProjectMissionTitle("A", "브랜드 촬영")).toBe("A 브랜드 촬영");
  });
});

describe("resolveShootingSchedule", () => {
  it("keeps shoot_date visible and offers calendar registration without tasks", () => {
    expect(resolveShootingSchedule({ shootDate: "2026-10-21", tasks: [], clientName: "A" })).toEqual({
      shootDate: "2026-10-21",
      matchingTask: null,
      isEmpty: false,
      needsCalendarRegistration: true,
    });
  });

  it("is empty only when both shoot_date and calendar tasks are absent", () => {
    expect(resolveShootingSchedule({ shootDate: null, tasks: [], clientName: "A" }).isEmpty).toBe(true);
  });

  it("recognizes an existing shooting task on shoot_date", () => {
    const task = { date: "2026-10-21", title: "A 촬영", category: "shooting" };
    const result = resolveShootingSchedule({ shootDate: "2026-10-21", tasks: [task], clientName: "A" });
    expect(result.matchingTask).toBe(task);
    expect(result.needsCalendarRegistration).toBe(false);
  });
});
