import { describe, expect, it } from "vitest";
import {
  AssistantValidationError,
  parseAssistantActionStatus,
  parseAssistantChannel,
  parseAssistantNotificationPriority,
  requireActionName,
  requireIsoDate,
  requireRecord,
  requireText,
  validateDateOrder,
} from "@/lib/assistant/validation";

describe("assistant validation", () => {
  it("지원 채널과 상태를 허용한다", () => {
    expect(parseAssistantChannel("kakao")).toBe("kakao");
    expect(parseAssistantActionStatus("waiting_confirmation")).toBe(
      "waiting_confirmation",
    );
    expect(parseAssistantNotificationPriority("CRITICAL")).toBe("CRITICAL");
  });

  it("알 수 없는 상태를 거부한다", () => {
    expect(() => parseAssistantActionStatus("done")).toThrow(
      AssistantValidationError,
    );
  });

  it("등록 가능한 Action 이름만 허용한다", () => {
    expect(requireActionName("calendar.create")).toBe("calendar.create");
    expect(() => requireActionName("DROP TABLE")).toThrow(
      AssistantValidationError,
    );
  });

  it("존재하지 않는 날짜를 거부한다", () => {
    expect(requireIsoDate("2026-07-24", "일정일")).toBe("2026-07-24");
    expect(() => requireIsoDate("2026-02-30", "일정일")).toThrow(
      "일정일 날짜가 존재하지 않습니다.",
    );
  });

  it("시작일이 마감일보다 늦으면 거부한다", () => {
    expect(() => validateDateOrder("2026-07-25", "2026-07-24")).toThrow(
      "시작일은 마감일보다 늦을 수 없습니다.",
    );
  });

  it("빈 제목과 최대 길이 초과를 거부한다", () => {
    expect(() => requireText(" ", "제목", { max: 200 })).toThrow(
      AssistantValidationError,
    );
    expect(() => requireText("a".repeat(201), "제목", { max: 200 })).toThrow(
      AssistantValidationError,
    );
  });

  it("지나치게 큰 JSON payload를 거부한다", () => {
    expect(() => requireRecord({ text: "가".repeat(100) }, "payload", 20)).toThrow(
      "payload의 크기가 너무 큽니다.",
    );
  });
});
