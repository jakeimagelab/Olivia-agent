import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const RUN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONSENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let updatePayload: Record<string, unknown> | null;
let workflowClientId = CLIENT_A;

function queryFor(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload;
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "portrait_consents") {
        return { data: { status: "signed", client_id: CLIENT_A, workflow_run_id: RUN_A }, error: null };
      }
      if (table === "clients") return { data: { id: CLIENT_B }, error: null };
      if (table === "workflow_runs") return { data: { id: RUN_A, client_id: workflowClientId }, error: null };
      return { data: null, error: null };
    }),
    single: vi.fn(async () => ({
      data: { id: CONSENT_ID, status: "signed", ...updatePayload },
      error: null,
    })),
  };
  return query;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => queryFor(table) }),
}));

import { PATCH } from "@/app/api/conti/portrait-consents/[id]/route";

function patchRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/conti/portrait-consents/${CONSENT_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("portrait consent admin update", () => {
  beforeEach(() => {
    updatePayload = null;
    workflowClientId = CLIENT_A;
  });

  it("rejects content edits after the consent is signed", async () => {
    const response = await PATCH(patchRequest({ title: "바뀐 제목" }), {
      params: Promise.resolve({ id: CONSENT_ID }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "서명 완료 문서는 내용을 수정할 수 없습니다." });
    expect(updatePayload).toBeNull();
  });

  it("allows changing customer and project links after signing", async () => {
    workflowClientId = CLIENT_B;
    const response = await PATCH(patchRequest({ clientId: CLIENT_B, workflowRunId: RUN_A }), {
      params: Promise.resolve({ id: CONSENT_ID }),
    });
    expect(response.status).toBe(200);
    expect(updatePayload).toEqual({ client_id: CLIENT_B, workflow_run_id: RUN_A });
  });

  it("rejects a project owned by another customer", async () => {
    workflowClientId = CLIENT_A;
    const response = await PATCH(patchRequest({ clientId: CLIENT_B, workflowRunId: RUN_A }), {
      params: Promise.resolve({ id: CONSENT_ID }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("선택한 촬영 건이 해당 고객의 프로젝트가 아닙니다.");
    expect(updatePayload).toBeNull();
  });
});
