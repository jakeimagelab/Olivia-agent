import { describe, expect, it } from "vitest";
import {
  calculateCalendarAvailability,
  findCalendarConflicts,
} from "@/lib/assistant/actions/calendarAvailability";

describe("calendar availability", () => {
  it("merges overlapping schedules and returns open windows", () => {
    expect(
      calculateCalendarAvailability({
        items: [
          { title: "회의", time: "10:00", durationMinutes: 60 },
          { title: "촬영", time: "10:30", durationMinutes: 90 },
          { title: "통화", time: "15:00", durationMinutes: 30 },
        ],
      }),
    ).toEqual([
      { start: "09:00", end: "10:00" },
      { start: "12:00", end: "15:00" },
      { start: "15:30", end: "18:00" },
    ]);
  });

  it("detects overlap but ignores completed schedules", () => {
    expect(
      findCalendarConflicts(
        [
          { title: "기존 회의", time: "10:00" },
          { title: "완료 일정", time: "10:30", completed: true },
        ],
        "10:30",
        30,
      ).map((item) => item.title),
    ).toEqual(["기존 회의"]);
  });
});
