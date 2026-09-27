import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUS_PANEL_SECTIONS,
  hasConnectionProblem,
  parseStoredSectionState,
  resolveSectionState,
  statusPanelBadge,
  systemAttentionItems,
} from "./panelModel";
import type { StatusPanelData } from "./panelTypes";

function data(level: "ok" | "warning" | "error" | "unknown" = "ok"): StatusPanelData {
  return {
    ok: true,
    checkedAt: "2026-09-27T00:00:00.000Z",
    diagnostics: {
      ok: true,
      checkedAt: "2026-09-27T00:00:00.000Z",
      issueCount: level === "ok" ? 0 : 1,
      summary: "",
      items: [{ id: "worker", group: "mac_studio", label: "Worker", level, state: level === "ok" ? "ONLINE" : "OFFLINE" }],
    },
    panelIssues: [],
    myTurn: [],
    progress: [],
    recentActivity: [],
  };
}

describe("status panel model", () => {
  it("문제가 0건이면 지금 확인할 것 목록이 비어 있다", () => {
    expect(systemAttentionItems(data("ok"))).toEqual([]);
  });

  it("연결이 모두 정상이면 기본 접힘이고 이상이 있으면 자동으로 펼친다", () => {
    expect(hasConnectionProblem(data("ok").diagnostics.items)).toBe(false);
    expect(resolveSectionState(null, false).connections).toBe(false);
    expect(resolveSectionState(JSON.stringify({ connections: false }), true).connections).toBe(true);
  });

  it("저장한 접힘 상태를 다시 읽고 손상된 값은 기본값으로 복구한다", () => {
    expect(parseStoredSectionState(JSON.stringify({ myTurn: false, progress: false, connections: true, recent: true }))).toEqual({
      myTurn: false,
      progress: false,
      connections: true,
      recent: true,
    });
    expect(parseStoredSectionState("not-json")).toEqual(DEFAULT_STATUS_PANEL_SECTIONS);
  });

  it("빨강, 주황, 내 차례 파랑 순서로 상단 배지 심각도를 정한다", () => {
    expect(statusPanelBadge({ issues: [
      { id: "e", kind: "x", level: "error", title: "오류" },
      { id: "w", kind: "x", level: "warning", title: "경고" },
    ], myTurnCount: 3 })).toEqual({ tone: "red", count: 2 });
    expect(statusPanelBadge({ issues: [
      { id: "w", kind: "x", level: "warning", title: "경고" },
      { id: "u", kind: "x", level: "unknown", title: "확인 불가" },
    ], myTurnCount: 3 })).toEqual({ tone: "orange", count: 2 });
    expect(statusPanelBadge({ issues: [], myTurnCount: 3 })).toEqual({ tone: "blue", count: 3 });
    expect(statusPanelBadge({ issues: [], myTurnCount: 0 })).toEqual({ tone: "none", count: 0 });
  });
});
