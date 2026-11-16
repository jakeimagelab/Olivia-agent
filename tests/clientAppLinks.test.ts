import { describe, expect, it } from "vitest";
import { buildClientAppLink, buildStepAppLink } from "@/lib/clientAppLinks";

describe("photo workspace client links", () => {
  it("opens the backup workflow directly in classification mode", () => {
    const link = buildStepAppLink({
      stepKey: "backup_sorting",
      clientId: "client-1",
      workflowRunId: "run-1",
    });

    expect(link).toContain("/photo-sorting?");
    expect(new URL(link, "https://olivia.local").searchParams.get("mode")).toBe("classification");
  });

  it("keeps a general photo workspace link on its default mode", () => {
    const link = buildClientAppLink({ app: "photo-sorting", clientId: "client-1" });

    expect(new URL(link, "https://olivia.local").searchParams.has("mode")).toBe(false);
  });

  it("opens retouching in the standalone photo retouching app", () => {
    const link = buildStepAppLink({
      stepKey: "retouching",
      clientId: "client-1",
      workflowRunId: "run-1",
    });

    const target = new URL(link, "https://olivia.local");
    expect(target.pathname).toBe("/photo-retouching");
    expect(target.searchParams.get("clientId")).toBe("client-1");
    expect(target.searchParams.get("workflowRunId")).toBe("run-1");
    expect(target.searchParams.has("tool")).toBe(false);
  });
});
