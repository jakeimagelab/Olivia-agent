import { describe, expect, it } from "vitest";
import { parseClipboardTasks } from "@/lib/calendarPaste";

describe("calendar clipboard parser", () => {
  it("parses Korean relative dates and afternoon time", () => {
    expect(parseClipboardTasks("내일 오후 2시 미소로한의원 촬영", "2026-07-23")).toEqual([
      expect.objectContaining({
        date: "2026-07-24",
        time: "14:00",
        end_time: "15:00",
        title: "미소로한의원 촬영",
        category: "shooting",
      }),
    ]);
  });

  it("creates one task per non-empty line", () => {
    const tasks = parseClipboardTasks("7월 25일 10:30 고객 미팅\n\n오늘 개인 운동", "2026-07-23");
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ date: "2026-07-25", time: "10:30", category: "client" });
    expect(tasks[1]).toMatchObject({ date: "2026-07-23", time: null, category: "personal" });
  });

  it("falls back to the selected date", () => {
    expect(parseClipboardTasks("자료 정리", "2026-08-02")[0]).toMatchObject({
      date: "2026-08-02",
      title: "자료 정리",
      category: "general",
    });
  });
});
