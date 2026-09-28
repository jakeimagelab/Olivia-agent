import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUS_PANEL_SECTIONS,
  groupStatusPanelEntries,
  hasConnectionProblem,
  limitStatusPanelEntryGroups,
  normalizeStatusPanelData,
  parseStoredSectionState,
  resolveSectionState,
  retryableStatusIssueIds,
  sortStatusPanelEntries,
  splitStaleStatusPanelEntries,
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

  it.each([
    ["worker 없음", { diagnostics: { items: [{ id: "mcp_tools", level: "ok" }] } }],
    ["recentBackups 없음", { diagnostics: { items: [] }, progress: [] }],
    ["recentJobs 없음", { diagnostics: { items: [] }, recentActivity: [] }],
    ["coreBypassIssues 없음", { diagnostics: { items: [] }, myTurn: [] }],
    ["consistencyError 없음", { diagnostics: { items: [] }, panelIssues: [] }],
    ["hermesFallbackCount24h 없음", { diagnostics: { items: [] } }],
    ["mcp 없음", { diagnostics: { items: [{ id: "worker", level: "ok" }] } }],
    ["schemaWarnings 없음", {}],
  ])("부분 응답에서도 상태표시줄 모델이 안전하게 렌더 데이터를 만든다: %s", (_label, raw) => {
    const normalized = normalizeStatusPanelData(raw);
    expect(() => systemAttentionItems(normalized)).not.toThrow();
    expect(normalized.panelIssues).toEqual([]);
    expect(normalized.myTurn).toEqual([]);
    expect(normalized.progress).toEqual([]);
    expect(normalized.recentActivity).toEqual([]);
  });

  it("MCP 확인 불가와 워크플로 정합성 조회 실패만 30초 재조회 대상으로 고른다", () => {
    const value = data("ok");
    value.diagnostics.items = [{
      id: "mcp_tools",
      group: "cloud",
      label: "MCP 도구",
      level: "unknown",
      state: "확인 불가",
    }];
    value.panelIssues = [{
      id: "query:workflow-consistency",
      kind: "query_error",
      level: "unknown",
      title: "워크플로 정합성 · 확인 불가",
    }];
    expect(retryableStatusIssueIds(value)).toEqual([
      "diagnostic:mcp_tools",
      "query:workflow-consistency",
    ]);
  });

  it("급한 항목을 먼저, 같은 심각도에서는 최신 항목을 먼저 정렬한다", () => {
    const entries = sortStatusPanelEntries([
      { id: "old-warning", kind: "x", level: "warning", title: "경고", createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "new-warning", kind: "x", level: "warning", title: "경고 최신", createdAt: "2026-09-28T00:00:00.000Z" },
      { id: "error", kind: "x", level: "error", title: "오류", createdAt: "2026-09-01T00:00:00.000Z" },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(["error", "new-warning", "old-warning"]);
  });

  it("14일 지난 항목은 기본 목록에서 분리하고 같은 제목은 한 묶음으로 만든다", () => {
    const split = splitStaleStatusPanelEntries({
      nowMs: Date.parse("2026-09-29T00:00:00.000Z"),
      entries: [
        { id: "recent-a", kind: "x", level: "info", title: "다음 단계 이동 승인", createdAt: "2026-09-28T00:00:00.000Z" },
        { id: "recent-b", kind: "x", level: "info", title: "다음 단계 이동 승인", createdAt: "2026-09-27T00:00:00.000Z" },
        { id: "stale", kind: "x", level: "warning", title: "오래된 승인", createdAt: "2026-09-01T00:00:00.000Z" },
      ],
    });
    expect(split.recent.map((entry) => entry.id)).toEqual(["recent-a", "recent-b"]);
    expect(split.stale.map((entry) => entry.id)).toEqual(["stale"]);
    const groups = groupStatusPanelEntries(split.recent);
    expect(groups).toEqual([expect.objectContaining({
      title: "다음 단계 이동 승인",
      entries: expect.arrayContaining([expect.objectContaining({ id: "recent-a" }), expect.objectContaining({ id: "recent-b" })]),
    })]);
    expect(limitStatusPanelEntryGroups([...groups, ...groups, ...groups, ...groups, ...groups, ...groups])).toHaveLength(5);
  });
});
