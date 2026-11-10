import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { revisionFromConflictDraft, shouldScheduleDraftAutosave } from "@/lib/select-gallery/draftAutosave";
import { parsePublicSelectionRevision } from "@/lib/select-gallery/publicSelection";

const mocks = vi.hoisted(() => ({
  getImageIds: vi.fn(),
  rpc: vi.fn(),
  currentDraft: { revision: 4, items: [], customer_memo: "", updated_at: "2026-11-10T00:00:00.000Z" } as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "person_select_shared_drafts") throw new Error(`unexpected table: ${table}`);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: mocks.currentDraft, error: null }),
      };
      return query;
    },
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/person-select/sharedPublic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/person-select/sharedPublic")>();
  return {
    ...actual,
    resolveSharedPersonSelectAccess: vi.fn(async () => ({
      event: { id: "event-1" },
      reviewer: { id: "reviewer-1" },
      legacyToken: false,
    })),
    getSharedPersonSelectImageIds: mocks.getImageIds,
  };
});

vi.mock("@/lib/select-gallery/publicSelection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/select-gallery/publicSelection")>();
  return { ...actual, enforcePublicSelectionRateLimit: vi.fn(async () => undefined) };
});

import { PUT } from "@/app/api/pick/shared/[shareToken]/draft/route";

function request(revision: number) {
  return new NextRequest("http://localhost/api/pick/shared/token/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, items: [], customerMemo: "" }),
  });
}

describe("customer Bridge draft reliability", () => {
  beforeEach(() => {
    mocks.getImageIds.mockReset();
    mocks.rpc.mockReset();
    mocks.currentDraft = { revision: 4, items: [], customer_memo: "", updated_at: "2026-11-10T00:00:00.000Z" };
  });

  it("rejects a stale revision before scanning images or invoking the error-raising RPC", async () => {
    const response = await PUT(request(3), { params: Promise.resolve({ shareToken: "token" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(body.draft.revision).toBe(4);
    expect(mocks.getImageIds).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("validates image ownership and saves only when the revision is current", async () => {
    mocks.getImageIds.mockResolvedValue([]);
    mocks.rpc.mockResolvedValue({
      data: [{ revision: 5, items: [], customer_memo: "", updated_at: "2026-11-10T00:00:01.000Z" }],
      error: null,
    });

    const response = await PUT(request(4), { params: Promise.resolve({ shareToken: "token" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).draft.revision).toBe(5);
    expect(mocks.getImageIds).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("blocks every automatic retry after a conflict until the page is reloaded", () => {
    expect(shouldScheduleDraftAutosave({ readOnly: false, dirty: true, conflictBlocked: false })).toBe(true);
    expect(shouldScheduleDraftAutosave({ readOnly: false, dirty: true, conflictBlocked: true })).toBe(false);
    expect(revisionFromConflictDraft(2, { revision: 7 })).toBe(7);
    expect(revisionFromConflictDraft(2, { revision: "invalid" })).toBe(2);
  });

  it("validates the revision before parsing thousands of image items", () => {
    expect(parsePublicSelectionRevision({ revision: 12 })).toBe(12);
    expect(() => parsePublicSelectionRevision({ revision: -1 })).toThrow("저장 버전");
  });
});
