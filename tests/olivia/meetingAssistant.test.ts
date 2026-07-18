import { describe, expect, it } from "vitest";
import {
  canApplyAiNextAction,
  createMeetingBriefingKey,
  findMatchingWorkflowRuns,
  getMeetingDateRange,
  isCustomerMeeting,
  meetingContentHash,
} from "@/lib/olivia/meetingAssistant";

describe("Olivia meeting assistant", () => {
  it("uses Korea date boundaries for the requested day span", () => {
    expect(getMeetingDateRange({ days: 2 }, new Date("2026-07-17T16:30:00.000Z"))).toEqual({ from: "2026-07-18", to: "2026-07-19" });
  });

  it("detects customer meetings while excluding personal tasks", () => {
    expect(isCustomerMeeting({ category: "client", title: "오블리브 미팅" })).toBe(true);
    expect(isCustomerMeeting({ category: "general", title: "라셀의원 상담" })).toBe(true);
    expect(isCustomerMeeting({ category: "personal", title: "개인 병원 방문" })).toBe(false);
  });

  it("links a uniquely named active workflow but leaves ambiguity visible", () => {
    const task = { id: "meeting-1", title: "오블리브의원 브랜드 미팅", memo: "" };
    const runs = [
      { id: "run-1", client_id: "client-1", client_name: "오블리브의원" },
      { id: "run-2", client_id: "client-2", client_name: "라셀의원" },
    ];
    expect(findMatchingWorkflowRuns(task, runs).connectionStatus).toBe("inferred");
    expect(findMatchingWorkflowRuns(task, [...runs, { id: "run-3", client_name: "오블리브", client_id: "client-3" }]).connectionStatus).toBe("ambiguous");
  });

  it("prefers an explicitly linked workflow", () => {
    const result = findMatchingWorkflowRuns({ meeting_context: { workflowRunId: "run-2" }, title: "미팅" }, [
      { id: "run-1", client_name: "첫 고객" },
      { id: "run-2", client_name: "연결 고객" },
    ]);
    expect(result.connectionStatus).toBe("linked");
    expect(result.workflowRun?.id).toBe("run-2");
  });

  it("keeps briefing and content deduplication keys stable", () => {
    expect(createMeetingBriefingKey("calendar", "workflow", "2026-07-18")).toBe("meeting_pre:calendar:workflow:2026-07-18");
    expect(meetingContentHash("라셀 의원 미팅")).toBe(meetingContentHash("라셀의원미팅"));
  });

  it("never overwrites a representative's manual next action", () => {
    expect(canApplyAiNextAction({ next_action: "대표가 직접 확인", next_action_source: "manual" })).toBe(false);
    expect(canApplyAiNextAction({ next_action: "기존 AI 제안", next_action_source: "ai" })).toBe(true);
    expect(canApplyAiNextAction({ next_action: "", next_action_source: "manual" })).toBe(true);
  });
});
