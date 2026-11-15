import { describe, expect, it } from "vitest";
import { resolveDesktopCaseTarget } from "@/components/olivia-os/useDesktopCaseData";

describe("Olivia OS desktop case target", () => {
  it("loads a case only for supported apps with a complete verified target", () => {
    const context = {
      clientId: "client-1",
      workflowRunId: "run-1",
      launchIntent: "document" as const,
    };

    expect(resolveDesktopCaseTarget("quote", context)).toEqual({
      clientId: "client-1",
      workflowRunId: "run-1",
      requested: true,
    });
    expect(resolveDesktopCaseTarget("conti", context).requested).toBe(true);
    expect(resolveDesktopCaseTarget("select-galleries", context).requested).toBe(true);
    expect(resolveDesktopCaseTarget("olivia-bridge", context).requested).toBe(false);
  });

  it("does not fetch when the client, workflow, or launch verification is missing", () => {
    expect(resolveDesktopCaseTarget("quote", { clientId: "client-1", launchIntent: "document" }).requested).toBe(false);
    expect(resolveDesktopCaseTarget("quote", { workflowRunId: "run-1", launchIntent: "document" }).requested).toBe(false);
    expect(resolveDesktopCaseTarget("quote", { clientId: "client-1", workflowRunId: "run-1" }).requested).toBe(false);
    expect(resolveDesktopCaseTarget("quote", {
      clientId: "client-1",
      projectId: "run-1",
      targetVerified: true,
    })).toMatchObject({ workflowRunId: "run-1", requested: true });
  });
});
