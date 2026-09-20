import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let adminSession = true;
const collectSystemStatus = vi.fn(async () => ({
  ok: true as const,
  checkedAt: "2026-09-19T00:00:00.000Z",
  issueCount: 0,
  summary: "현재 확인된 시스템 이상이 없습니다.",
  items: [],
}));

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => adminSession }));
vi.mock("@/lib/system-status/service", () => ({ collectSystemStatus }));

async function callRoute() {
  const { GET } = await import("@/app/api/system-status/route");
  return GET(new NextRequest("http://localhost/api/system-status"));
}

beforeEach(() => {
  adminSession = true;
  collectSystemStatus.mockClear();
});

describe("GET /api/system-status", () => {
  it("관리자 세션이 아니면 진단을 실행하지 않고 401", async () => {
    adminSession = false;
    const response = await callRoute();
    expect(response.status).toBe(401);
    expect(collectSystemStatus).not.toHaveBeenCalled();
  });

  it("관리자 세션이면 읽기 전용 진단 결과를 no-store로 반환한다", async () => {
    const response = await callRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, issueCount: 0 });
  });
});
