import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/olivia/nameSearch", () => ({
  fuzzyNameSearchOne: vi.fn(),
}));

import { fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = {
  recentActions: [],
  revision: 1,
};

function call(input: Record<string, unknown>) {
  return executeAgentTool({ id: "open-feature-call", name: "open_feature", arguments: JSON.stringify(input) }, context);
}

// 2026-08-16 사용자 리포트 — "OO병원 고객관리 페이지 열어줘"가 그 고객 화면이 아니라 항상 고객
// 목록(/clients)만 열었다. hospitalName을 함께 넘기면 그 고객이 바로 선택된 화면으로 딥링크해야 한다.
describe("open_feature — 고객명이 있으면 고객관리 화면을 그 고객으로 딥링크한다", () => {
  beforeEach(() => {
    vi.mocked(fuzzyNameSearchOne).mockReset();
  });

  it("hospitalName이 있고 고객을 찾으면 /clients?clientId=로 연다", async () => {
    vi.mocked(fuzzyNameSearchOne).mockResolvedValueOnce({ id: "client-abc", hospital_name: "미소로한의원" });
    const execution = await call({ featureQuery: "고객관리 페이지", hospitalName: "미소로한의원" });
    expect(execution.result).toMatchObject({ success: true, data: { matched: true, href: "/clients?clientId=client-abc" } });
  });

  it("hospitalName이 있어도 고객을 못 찾으면 목록(/clients)으로 그냥 연다", async () => {
    vi.mocked(fuzzyNameSearchOne).mockResolvedValueOnce(null);
    const execution = await call({ featureQuery: "고객관리 페이지", hospitalName: "존재하지않는병원" });
    expect(execution.result).toMatchObject({ success: true, data: { matched: true, href: "/clients" } });
  });

  it("hospitalName이 없으면 기존처럼 그냥 목록을 연다(조회 없음)", async () => {
    const execution = await call({ featureQuery: "고객관리 페이지", hospitalName: null });
    expect(fuzzyNameSearchOne).not.toHaveBeenCalled();
    expect(execution.result).toMatchObject({ success: true, data: { matched: true, href: "/clients" } });
  });

  it("고객 스코프를 지원하지 않는 화면은 hospitalName이 있어도 그대로 연다", async () => {
    const execution = await call({ featureQuery: "콘티/초상권 작성", hospitalName: "미소로한의원" });
    expect(fuzzyNameSearchOne).not.toHaveBeenCalled();
    expect(execution.result).toMatchObject({ success: true, data: { matched: true, href: "/conti" } });
  });
});
