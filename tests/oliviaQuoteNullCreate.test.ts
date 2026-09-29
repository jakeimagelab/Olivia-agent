import { describe, expect, it, vi } from "vitest";

const emitOliviaEventSafely = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("@/lib/olivia/events", () => ({
  emitOliviaEventSafely,
  createEventDeduplicationKey: () => "event-key",
}));

import { executeOliviaCrud } from "@/lib/olivia/crud/executor";

describe("견적서 생성 null 저장", () => {
  it("촬영일·제목·메모가 없으면 null을 보내지 않고 저장한다", async () => {
    let inserted: Record<string, unknown> | undefined;
    const db = {
      from(table: string) {
        if (table !== "quotes") throw new Error(`unexpected table: ${table}`);
        return {
          select() {
            return {
              eq() {
                return {
                  limit() {
                    return { maybeSingle: async () => ({ data: null, error: null }) };
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            inserted = payload;
            return {
              select() {
                return {
                  single: async () => ({ data: { id: "quote-1", ...payload }, error: null }),
                };
              },
            };
          },
        };
      },
    };

    const result = await executeOliviaCrud(db as never, {
      operation: "create",
      domain: "quote",
      data: {
        hospitalName: "미연결 고객",
        title: null,
        shootDate: null,
        quoteNumber: null,
        memos: null,
        workflowRunId: null,
        clientId: null,
        contactName: null,
        phone: null,
        email: null,
        packageId: null,
      },
    });

    expect(result.recordId).toBe("quote-1");
    expect(inserted).toEqual(expect.objectContaining({
      hospital_name: "미연결 고객",
      contact_name: null,
      phone: null,
      email: null,
      package_id: null,
    }));
    expect(inserted).not.toHaveProperty("title");
    expect(inserted).not.toHaveProperty("shoot_date");
    expect(inserted).not.toHaveProperty("memos");
    expect(inserted).not.toHaveProperty("workflow_run_id");
    expect(inserted).not.toHaveProperty("client_id");
  });
});
