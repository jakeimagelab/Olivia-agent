import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildHermesRuntime } from "@/lib/hermes/runtimeContext";
import { isClientScopedExecutionRequest } from "@/lib/olivia/v2/executionIntent";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("Olivia Phase 1 Core boundaries", () => {
  it("does not update workflow current_step_key outside workflowAutomation", () => {
    const roots = [join(process.cwd(), "app"), join(process.cwd(), "lib")];
    const offenders = roots.flatMap(sourceFiles).flatMap((path) => {
      if (path.endsWith("lib/workflowAutomation.ts")) return [];
      const source = readFileSync(path, "utf8");
      return /from\(["']workflow_runs["']\)\s*\.update\(\s*\{[^}]*current_step_key/.test(source)
        ? [relative(process.cwd(), path)]
        : [];
    });
    expect(offenders).toEqual([]);
  });

  it("routes every known workflow bypass through the existing command engine", () => {
    const paths = [
      "app/api/client-portal/gallery-workspace/final/route.ts",
      "app/api/select-galleries/[id]/raw-match/route.ts",
      "app/api/select-galleries/create-from-photo-sorting/route.ts",
      "lib/photo-storage/shootingProgress.ts",
    ];
    for (const path of paths) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      expect(source, path).toContain("advanceWorkflow(");
    }
  });
});

describe("atomic Olivia document context", () => {
  beforeEach(() => useOliviaContextStore.getState().clearContext());

  it("updates document, client and project in one revision", () => {
    const before = useOliviaContextStore.getState().revision;
    useOliviaContextStore.getState().setCurrentDocument("contract-a", "contract", "A 계약서", {
      clientId: "client-a",
      clientName: "A병원",
      projectId: "run-a",
      projectName: "A 촬영",
    });
    const state = useOliviaContextStore.getState();
    expect(state).toMatchObject({
      currentDocumentId: "contract-a",
      activeClientId: "client-a",
      activeClientName: "A병원",
      activeProjectId: "run-a",
      activeProjectName: "A 촬영",
      revision: before + 1,
    });
  });

  it("does not create a revision for identical scalar context", () => {
    const link = { clientId: "client-b", clientName: "B병원", projectId: "run-b", projectName: "B 촬영" };
    useOliviaContextStore.getState().setCurrentDocument("quote-b", "quote", "B 견적서", link);
    const revision = useOliviaContextStore.getState().revision;
    useOliviaContextStore.getState().setCurrentDocument("quote-b", "quote", "B 견적서", link);
    expect(useOliviaContextStore.getState().revision).toBe(revision);
  });

  it("distinguishes omitted context from an explicit context clear", () => {
    const store = useOliviaContextStore.getState();
    store.setContextLink({ clientId: "client-c", clientName: "C병원", projectId: "run-c", projectName: "C 촬영" });
    store.setContextLink({});
    expect(useOliviaContextStore.getState()).toMatchObject({
      activeClientId: "client-c",
      activeClientName: "C병원",
      activeProjectId: "run-c",
      activeProjectName: "C 촬영",
    });

    store.setContextLink({ clientId: undefined, clientName: undefined, projectId: undefined, projectName: undefined });
    expect(useOliviaContextStore.getState()).toMatchObject({
      activeClientId: undefined,
      activeClientName: undefined,
      activeProjectId: undefined,
      activeProjectName: undefined,
    });
  });
});

describe("client-scoped execution guard", () => {
  it("requires a client for client document mutations only", () => {
    expect(isClientScopedExecutionRequest("견적 승인해줘")).toBe(true);
    expect(isClientScopedExecutionRequest("잔금을 촬영 당일로 변경해줘")).toBe(true);
    expect(isClientScopedExecutionRequest("견적서 내용 알려줘")).toBe(false);
    expect(isClientScopedExecutionRequest("내일 오후 3시 일정 잡아줘")).toBe(false);
    expect(isClientScopedExecutionRequest("0911_WINF 원본 분리해줘")).toBe(false);
  });

  it("does not recover a client from recent history for an execution request", () => {
    const runtime = buildHermesRuntime({
      snapshot: { recentActions: [], revision: 1 },
      channel: "web",
      today: "2026-09-25",
      message: "아까 견적 승인해줘",
      history: [{
        role: "assistant",
        content: "A 견적을 찾았어요.",
        metadata: { resourceType: "quote", resourceId: "quote-a", clientId: "client-a" },
      }],
    });
    expect(runtime.context.activeClientId).toBeUndefined();
  });
});
