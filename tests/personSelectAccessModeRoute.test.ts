import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => true }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));

import { PATCH } from "@/app/api/person-select/[eventId]/route";

function eventLookup(accessMode: "individual" | "project_shared", sharedToken: string | null = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { access_mode: accessMode, shared_token: sharedToken }, error: null })),
      })),
    })),
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/person-select/event-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const emptyFacts = {
  peopleCount: 0,
  imageCount: 500,
  choiceCount: 0,
  sharedDraftCount: 0,
  sharedSelectionCount: 0,
  accessedPeopleCount: 0,
  submittedPeopleCount: 0,
  orderPeopleCount: 0,
  ownedImageCount: 0,
  groupImageCount: 0,
  unassignedImageCount: 500,
  ownersWithoutPinCount: 0,
  groupsWithoutEligiblePeopleCount: 0,
};

describe("person-select access-mode PATCH", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
    mocks.from.mockImplementation((table: string) => {
      if (table === "person_select_events") return eventLookup("individual");
      throw new Error(`unexpected table: ${table}`);
    });
  });

  it("changes a photos-only project without re-uploading or mutating image rows", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: emptyFacts, error: null })
      .mockResolvedValueOnce({ data: { ok: true, event: { id: "event-1", access_mode: "project_shared" } }, error: null });

    const response = await PATCH(request({ access_mode: "project_shared" }), { params: Promise.resolve({ eventId: "event-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, event: { access_mode: "project_shared" } });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalledWith("person_select_images");
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "apply_person_select_access_mode_change", expect.objectContaining({
      p_event_id: "event-1",
      p_expected_mode: "individual",
      p_next_mode: "project_shared",
      p_expected_facts: emptyFacts,
      p_confirmed: false,
    }));
  });

  it("requires and records explicit confirmation for auto-created participants", async () => {
    const ownedFacts = { ...emptyFacts, peopleCount: 22, imageCount: 2800, ownedImageCount: 2800, unassignedImageCount: 0 };
    mocks.rpc.mockResolvedValueOnce({ data: ownedFacts, error: null });
    const first = await PATCH(request({ access_mode: "project_shared" }), { params: Promise.resolve({ eventId: "event-1" }) });
    expect(first.status).toBe(409);
    expect(await first.json()).toMatchObject({ code: "ACCESS_MODE_CONFIRMATION_REQUIRED" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: ownedFacts, error: null })
      .mockResolvedValueOnce({ data: { ok: true, event: { id: "event-1", access_mode: "project_shared" } }, error: null });
    const confirmed = await PATCH(request({ access_mode: "project_shared", confirm_access_mode_impact: true }), { params: Promise.resolve({ eventId: "event-1" }) });
    expect(confirmed.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "apply_person_select_access_mode_change", expect.objectContaining({ p_confirmed: true }));
  });

  it("blocks a project with customer choices before the transactional change", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...emptyFacts, peopleCount: 1, ownedImageCount: 500, unassignedImageCount: 0, accessedPeopleCount: 1, choiceCount: 3 }, error: null });
    const response = await PATCH(request({ access_mode: "project_shared", confirm_access_mode_impact: true }), { params: Promise.resolve({ eventId: "event-1" }) });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("ACCESS_MODE_CHANGE_BLOCKED");
    expect(body.error).toContain("개인별 선택·메모·보정 요청이 3건");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
