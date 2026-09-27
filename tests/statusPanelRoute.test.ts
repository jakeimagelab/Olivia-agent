import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { StatusPanelData } from "@/lib/system-status/panelTypes";
import type { SystemStatusReport } from "@/lib/system-status/types";

const db = { name: "status-db" };
let adminSession = true;
let diagnostics: SystemStatusReport;
let panelData: StatusPanelData;

const collectSystemStatus = vi.fn();
const collectStatusPanelData = vi.fn();

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db }));
vi.mock("@/lib/passkey", () => ({ isAdminSession: () => adminSession }));
vi.mock("@/lib/system-status/service", () => ({ collectSystemStatus }));
vi.mock("@/lib/system-status/panelService", () => ({ collectStatusPanelData }));

async function callStatusPanel() {
  const { GET } = await import("@/app/api/olivia-os/status-panel/route");
  return GET(new NextRequest("http://localhost/api/olivia-os/status-panel"));
}

beforeEach(() => {
  adminSession = true;
  diagnostics = {
    ok: true,
    checkedAt: "2026-09-27T00:00:00.000Z",
    issueCount: 0,
    summary: "현재 확인된 시스템 이상이 없습니다.",
    items: [],
  };
  panelData = {
    ok: true,
    checkedAt: diagnostics.checkedAt,
    diagnostics,
    panelIssues: [],
    myTurn: [],
    progress: [],
    recentActivity: [],
  };
  collectSystemStatus.mockReset().mockResolvedValue(diagnostics);
  collectStatusPanelData.mockReset().mockResolvedValue(panelData);
});

describe("GET /api/olivia-os/status-panel", () => {
  it("관리자 세션이 아니면 401이고 상태 조회를 시작하지 않는다", async () => {
    adminSession = false;
    const response = await callStatusPanel();
    expect(response.status).toBe(401);
    expect(collectSystemStatus).not.toHaveBeenCalled();
  });

  it("collectSystemStatus를 단일 진단 소스로 사용하고 팝업 전용 수집기에 전달한다", async () => {
    const response = await callStatusPanel();
    expect(response.status).toBe(200);
    expect(collectSystemStatus).toHaveBeenCalledWith({ db, now: expect.any(Date) });
    expect(collectStatusPanelData).toHaveBeenCalledWith({ db, diagnostics, now: expect.any(Date) });
    expect(await response.json()).toEqual(panelData);
  });
});
