import { describe, expect, it } from "vitest";
import {
  isWithinQuietHours,
  shouldSendNotificationNow,
} from "@/lib/assistant/notifications/priority";

describe("assistant notification priority", () => {
  it("자정을 넘는 방해 금지 시간을 계산한다", () => {
    expect(isWithinQuietHours(23 * 60, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(6 * 60 + 30, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(12 * 60, "22:00", "07:00")).toBe(false);
  });

  it("CRITICAL 알림은 방해 금지 시간에도 보낸다", () => {
    expect(
      shouldSendNotificationNow({
        priority: "CRITICAL",
        settings: {
          quiet_hours_enabled: true,
          quiet_hours_start: "22:00",
          quiet_hours_end: "07:00",
        },
        nowMinutes: 23 * 60,
      }),
    ).toBe(true);
  });

  it("일반 알림은 방해 금지 시간에 보류한다", () => {
    expect(
      shouldSendNotificationNow({
        priority: "NORMAL",
        settings: {
          quiet_hours_enabled: true,
          quiet_hours_start: "22:00",
          quiet_hours_end: "07:00",
        },
        nowMinutes: 23 * 60,
      }),
    ).toBe(false);
  });
});
