import { afterEach, describe, expect, it, vi } from "vitest";
import { emitOliviaEventSafely } from "@/lib/olivia/events";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { resetSafelyFailureReportsForTests } from "@/lib/observability/safelyFailure";

afterEach(() => {
  resetSafelyFailureReportsForTests();
  vi.restoreAllMocks();
});

describe("Safely write helpers", () => {
  it("returns an observable failure when event persistence fails without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
          }),
        }),
      }),
    };

    await expect(emitOliviaEventSafely(db as never, {
      eventType: "workflow.step_changed",
      eventSource: "test",
    })).resolves.toEqual({ ok: false, error: "permission denied" });
    expect(warnSpy).toHaveBeenCalledWith(
      "[safely/emitOliviaEventSafely]",
      "workflow.step_changed",
      "permission denied",
    );
  });

  it("returns an observable failure when activity persistence fails without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = { from: () => ({ insert: async () => ({ error: { message: "connection closed" } }) }) };

    await expect(recordPcrmActivitySafely(db as never, {
      clientId: "client-1",
      actorType: "admin",
      actionType: "quote_published",
      title: "견적서 공개",
    })).resolves.toEqual({ ok: false, error: "connection closed" });
    expect(warnSpy).toHaveBeenCalledWith(
      "[safely/recordPcrmActivitySafely]",
      "quote_published",
      "connection closed",
    );
  });
});
