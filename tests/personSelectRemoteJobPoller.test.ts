import { describe, expect, it } from "vitest";
import { isRemoteJobTerminalStatus, resolveRemoteJobResult } from "@/components/person-select/admin/hooks/useRemoteJobPoller";

describe("person select remote job poller", () => {
  it("recognizes only terminal remote job statuses", () => {
    expect(isRemoteJobTerminalStatus("COMPLETED")).toBe(true);
    expect(isRemoteJobTerminalStatus("FAILED")).toBe(true);
    expect(isRemoteJobTerminalStatus("CANCELED")).toBe(true);
    expect(isRemoteJobTerminalStatus("RUNNING")).toBe(false);
    expect(isRemoteJobTerminalStatus(undefined)).toBe(false);
  });

  it("keeps a worker result and creates a stable fallback error", () => {
    const result = { matchedCount: 52 };
    expect(resolveRemoteJobResult({ status: "COMPLETED", result })).toBe(result);
    expect(resolveRemoteJobResult({ status: "FAILED", message: "runner failed" })).toEqual({ error: "runner failed" });
    expect(resolveRemoteJobResult({ status: "FAILED" }, "보정본 실패")).toEqual({ error: "보정본 실패" });
  });
});
