import { describe, expect, it } from "vitest";
import { missionSnapshotMatches, shouldLoadMissionSummary } from "@/components/dashboard/ActiveMissionBar";

describe("ActiveMissionBar target ownership", () => {
  it("일반 작업창은 대상 없는 상태에서 전체 최근 미션을 조회하지 않는다", () => {
    expect(shouldLoadMissionSummary("explicit", undefined)).toBe(false);
    expect(shouldLoadMissionSummary("explicit", "run-b")).toBe(false);
    expect(shouldLoadMissionSummary("recommendation", undefined)).toBe(true);
    expect(shouldLoadMissionSummary("recommendation", "run-b")).toBe(false);
  });

  it("명시한 촬영 건과 같은 snapshot만 현재 미션으로 표시한다", () => {
    expect(missionSnapshotMatches("run-b", "run-b")).toBe(true);
    expect(missionSnapshotMatches("run-b", "run-a")).toBe(false);
    expect(missionSnapshotMatches("run-b", undefined)).toBe(false);
    expect(missionSnapshotMatches(undefined, "run-a")).toBe(false);
  });
});
