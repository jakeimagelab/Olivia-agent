import { describe, expect, it, vi } from "vitest";
import {
  executeRunner,
  resolveRunnerError,
} from "@/lib/remote-jobs/node/workerRunnerProcess";

describe("Mac Studio runner process", () => {
  it("captures the last JSON result and structured progress", async () => {
    const progress: Record<string, unknown>[] = [];
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const script = [
      `console.error("OLIVIA_REMOTE_PROGRESS " + JSON.stringify({stage:"copying",current:1,total:1}));`,
      `console.log("runner detail");`,
      `console.log(JSON.stringify({ok:true,status:"DONE"}));`,
    ].join("");

    const outcome = await executeRunner({
      command: process.execPath,
      args: ["-e", script],
      cwd: process.cwd(),
    }, async (snapshot) => {
      progress.push(snapshot);
    });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.result).toEqual({ ok: true, status: "DONE" });
    expect(progress).toEqual([{ stage: "copying", current: 1, total: 1 }]);
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("OLIVIA_REMOTE_PROGRESS"));
  });

  it("prefers structured errors over stderr and exit codes", () => {
    expect(resolveRunnerError({
      exitCode: 2,
      result: { ok: false, error: "촬영시각 불일치" },
      stdout: "",
      stderr: "fallback error",
    })).toBe("촬영시각 불일치");
  });

  it("reports malformed stdout when no result JSON exists", () => {
    expect(resolveRunnerError({
      exitCode: 1,
      result: null,
      stdout: "not-json",
      stderr: "",
    })).toContain("runner 결과 JSON을 읽지 못했습니다");
  });
});
