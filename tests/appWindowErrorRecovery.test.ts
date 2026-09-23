import { describe, expect, it } from "vitest";
import {
  APP_WINDOW_ERROR_RETRY_LIMIT,
  getAppWindowErrorFingerprint,
  recordAppWindowError,
} from "@/lib/errors/appWindowErrorRecovery";

describe("AppWindow error recovery guard", () => {
  it("locks a window after the same error is caught three times", () => {
    const fingerprint = getAppWindowErrorFingerprint(new Error("Maximum update depth exceeded"), "at ClientsWorkspace");
    let counts: Readonly<Record<string, number>> = {};
    let recovery = recordAppWindowError(counts, fingerprint);
    counts = recovery.counts;
    expect(recovery.locked).toBe(false);
    recovery = recordAppWindowError(counts, fingerprint);
    counts = recovery.counts;
    expect(recovery.locked).toBe(false);
    recovery = recordAppWindowError(counts, fingerprint);
    expect(recovery.occurrenceCount).toBe(APP_WINDOW_ERROR_RETRY_LIMIT);
    expect(recovery.locked).toBe(true);
  });

  it("tracks different errors independently", () => {
    const first = getAppWindowErrorFingerprint(new Error("first"), "at A");
    const second = getAppWindowErrorFingerprint(new Error("second"), "at B");
    let recovery = recordAppWindowError({}, first);
    recovery = recordAppWindowError(recovery.counts, first);
    const other = recordAppWindowError(recovery.counts, second);
    expect(other.occurrenceCount).toBe(1);
    expect(other.locked).toBe(false);
  });
});
