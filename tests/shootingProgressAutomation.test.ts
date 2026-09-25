import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const workflow = vi.hoisted(() => ({
  run: { id: "run-1", current_step_key: "shooting" } as Row,
  stepRuns: new Map<string, Row>(),
  advances: [] as Array<Record<string, unknown>>,
  completedTasks: [] as string[],
}));

vi.mock("@/lib/workflowAutomation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflowAutomation")>();
  const advanceWorkflow = async (_db: unknown, input: Row) => {
    // completeShoot()가 to_step_key 없이 부르므로(PHASE 3 작업 1-B/3), 실제 getNextWorkflowStep으로
    // 다음 단계를 계산한다 — 기존처럼 backup_sorting을 아무 데서나 하드코딩하지 않는다.
    const toStepKey = input.to_step_key ?? actual.getNextWorkflowStep(input.from_step_key);
    workflow.advances.push({ ...input, to_step_key: toStepKey });
    workflow.run.current_step_key = toStepKey;
    return { skipped: false, from_step_key: input.from_step_key, to_step_key: toStepKey, created: [] };
  };
  const maybeAdvanceWorkflow = async (db: unknown, workflowRunId: string, stepKey: string) => {
    const result = await advanceWorkflow(db, { workflow_run_id: workflowRunId, from_step_key: stepKey, reason: "auto" });
    return { advanced: true as const, result };
  };
  return {
    getWorkflowRun: async () => ({ ...workflow.run }),
    advanceWorkflow,
    maybeAdvanceWorkflow,
    ensureStepRun: async (_db: unknown, workflowRunId: string, stepKey: string, status: string) => {
      const key = `${workflowRunId}:${stepKey}`;
      const existing = workflow.stepRuns.get(key);
      if (existing) return existing;
      const created = { id: `step-${stepKey}`, workflow_run_id: workflowRunId, step_key: stepKey, status };
      workflow.stepRuns.set(key, created);
      return created;
    },
    completeOpenStepTasksForManualSave: async (_db: unknown, _workflowRunId: string, stepKey: string) => {
      workflow.completedTasks.push(stepKey);
    },
    buildNextAction: (stepKey: string) => `next:${stepKey}`,
  };
});

function createDb(initial: Record<string, Row[]>) {
  const tables = Object.fromEntries(Object.entries(initial).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));

  function query(table: string, operation: "select" | "update" | "insert", payload?: Row) {
    const filters: Array<(row: Row) => boolean> = [];
    const builder: any = {
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      neq(column: string, value: unknown) { filters.push((row) => row[column] !== value); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      select() { return builder; },
      async maybeSingle() {
        const rows = tables[table] ?? [];
        if (operation === "insert") {
          const inserted = { id: payload?.id ?? `${table}-${rows.length + 1}`, ...payload };
          rows.push(inserted);
          return { data: inserted, error: null };
        }
        const matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation === "update") matches.forEach((row) => Object.assign(row, payload));
        return { data: matches[0] ?? null, error: null };
      },
      async single() {
        const result = await builder.maybeSingle();
        return result.data ? result : { data: null, error: new Error("not found") };
      },
      then(resolve: (value: { data: Row[]; error: null }) => void) {
        const rows = tables[table] ?? [];
        const matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation === "update") matches.forEach((row) => Object.assign(row, payload));
        resolve({ data: matches, error: null });
      },
    };
    return builder;
  }

  return {
    tables,
    from(table: string) {
      if (!tables[table]) tables[table] = [];
      return {
        select: () => query(table, "select"),
        update: (patch: Row) => query(table, "update", patch),
        insert: (row: Row) => query(table, "insert", row),
      };
    },
  };
}

beforeEach(() => {
  workflow.run = { id: "run-1", current_step_key: "shooting" };
  workflow.stepRuns.clear();
  workflow.advances.length = 0;
  workflow.completedTasks.length = 0;
});

describe("shooting progress automation", () => {
  it("links one shooting calendar and workflow, then advances shooting to payment_confirm", async () => {
    const db = createDb({
      calendar_tasks: [{ id: "cal-1", date: "2026-09-11", title: "WINF 촬영", location: "WINF", category: "shooting" }],
      workflow_runs: [{ id: "run-1", shoot_date: "2026-09-11", client_name: "WINF", project_name: "9월 촬영", current_step_key: "shooting", status: "active" }],
      photo_storage_projects: [],
    });
    const { registerDetectedPhotoProject } = await import("@/lib/photo-storage/shootingProgress");
    const result = await registerDetectedPhotoProject(db as any, {
      folderName: "0911_WINF",
      detectedAt: "2026-09-11T10:00:00.000Z",
    });

    expect(result.link).toMatchObject({ calendarTaskId: "cal-1", workflowRunId: "run-1", matched: true });
    expect(db.tables.photo_storage_projects[0]).toMatchObject({
      source_relative_path: "0911_WINF",
      workflow_run_id: "run-1",
      calendar_task_id: "cal-1",
      status: "READY",
    });
    // PHASE 3 작업 1-B(2026-09-25) — NAS 자동 감지가 잔금·계산서(payment_confirm)를 건너뛰고
    // 곧장 backup_sorting으로 가던 사고를 고쳤다. 이제는 두 경로(홈 채팅 확인, NAS 자동 감지)
    // 모두 payment_confirm에서 멈춘다.
    expect(workflow.advances).toMatchObject([{ from_step_key: "shooting", to_step_key: "payment_confirm" }]);
  });

  it("keeps an unmatched folder as a standalone photo project", async () => {
    const db = createDb({ calendar_tasks: [], workflow_runs: [], photo_storage_projects: [] });
    const { registerDetectedPhotoProject } = await import("@/lib/photo-storage/shootingProgress");
    const result = await registerDetectedPhotoProject(db as any, {
      folderName: "0911_WINF",
      detectedAt: "2026-09-11T10:00:00.000Z",
    });

    expect(result.link).toMatchObject({ workflowRunId: null, matched: false, reason: "calendar_not_found" });
    expect(db.tables.photo_storage_projects[0]).toMatchObject({ source_relative_path: "0911_WINF", status: "READY" });
    expect(workflow.advances).toHaveLength(0);
  });

  it("keeps a calendar-linked shooting as a standalone project when no workflow run exists", async () => {
    const db = createDb({
      calendar_tasks: [{ id: "cal-1", date: "2026-09-11", title: "WINF 촬영", location: "WINF", category: "shooting" }],
      workflow_runs: [],
      photo_storage_projects: [],
    });
    const { registerDetectedPhotoProject } = await import("@/lib/photo-storage/shootingProgress");
    const result = await registerDetectedPhotoProject(db as any, {
      folderName: "0911_WINF",
      detectedAt: "2026-09-11T10:00:00.000Z",
    });

    expect(result.link).toMatchObject({
      calendarTaskId: "cal-1",
      workflowRunId: null,
      matched: false,
      reason: "workflow_not_found",
    });
    expect(db.tables.photo_storage_projects[0]).toMatchObject({
      source_relative_path: "0911_WINF",
      calendar_task_id: "cal-1",
      workflow_run_id: null,
    });
    expect(workflow.advances).toHaveLength(0);
  });

  it("does not connect a folder to a same-date workflow for another customer", async () => {
    const db = createDb({
      calendar_tasks: [{ id: "cal-1", date: "2026-09-11", title: "WINF 촬영", location: "WINF", category: "shooting" }],
      workflow_runs: [
        { id: "run-winf", shoot_date: "2026-09-11", client_name: "WINF", project_name: "9월 촬영", status: "active" },
        { id: "run-other", shoot_date: "2026-09-11", client_name: "다른병원", project_name: "정기 촬영", status: "active" },
      ],
      photo_storage_projects: [],
    });
    const { registerDetectedPhotoProject } = await import("@/lib/photo-storage/shootingProgress");
    const result = await registerDetectedPhotoProject(db as any, {
      folderName: "0911_WINF",
      detectedAt: "2026-09-11T10:00:00.000Z",
    });

    expect(result.link.workflowRunId).toBe("run-winf");
  });

  it("does not connect to an old-year schedule when the nearest shoot date has none", async () => {
    const db = createDb({
      calendar_tasks: [{ id: "cal-old", date: "2025-09-11", title: "WINF 촬영", location: "WINF", category: "shooting" }],
      workflow_runs: [{ id: "run-old", shoot_date: "2025-09-11", client_name: "WINF", status: "active" }],
      photo_storage_projects: [],
    });
    const { registerDetectedPhotoProject } = await import("@/lib/photo-storage/shootingProgress");
    const result = await registerDetectedPhotoProject(db as any, {
      folderName: "0911_WINF",
      detectedAt: "2026-09-11T10:00:00.000Z",
    });

    expect(result.link).toMatchObject({ workflowRunId: null, calendarTaskId: null, reason: "calendar_not_found" });
  });

  // PHASE 3 작업 1-B(2026-09-25) — 잔금·계산서 확인 전에 사진 분류가 끝나도 워크플로 단계
  // 표시는 backup_sorting으로 넘어가지 않고 payment_confirm에서 대기해야 한다. 사진 분류
  // 자체(이 함수가 불릴 때는 이미 끝난 상태)는 막지 않는다 — 여기서 검증하는 건 오직 워크플로
  // "단계 표시" 전진 여부와 workflow.blocked 이벤트다.
  it("waits at payment_confirm instead of auto-advancing when classification finishes early", async () => {
    workflow.run = { id: "run-1", current_step_key: "payment_confirm", client_id: "client-1", project_id: "proj-1" };
    const db = createDb({
      photo_storage_projects: [{ id: "project-1", workflow_run_id: "run-1" }],
      workflow_runs: [{ id: "run-1", current_step_key: "payment_confirm" }],
      olivia_events: [],
    });
    const { syncClassificationCompletedWorkflow } = await import("@/lib/photo-storage/shootingProgress");
    await syncClassificationCompletedWorkflow(db as any, "project-1");

    expect(workflow.advances).toHaveLength(0);
    expect(workflow.completedTasks).toHaveLength(0);
    expect(db.tables.olivia_events[0]).toMatchObject({
      event_type: "workflow.blocked",
      workflow_run_id: "run-1",
      client_id: "client-1",
      project_id: "proj-1",
      payload: { stepKey: "payment_confirm", waitingFor: "payment_confirm" },
    });
    expect(db.tables.workflow_runs[0]).toMatchObject({ next_action: "잔금·계산서 확인 후 분류 단계로 진행" });
  });

  it("opens original delivery after classification without exposing a legacy current step", async () => {
    workflow.run.current_step_key = "backup_sorting";
    const db = createDb({
      photo_storage_projects: [{ id: "project-1", workflow_run_id: "run-1" }],
      workflow_runs: [{ id: "run-1", current_step_key: "backup_sorting" }],
      workflow_step_runs: [],
    });
    const { syncClassificationCompletedWorkflow } = await import("@/lib/photo-storage/shootingProgress");
    await syncClassificationCompletedWorkflow(db as any, "project-1");

    expect(workflow.completedTasks).toEqual(["backup_sorting"]);
    expect(workflow.advances).toMatchObject([{ from_step_key: "backup_sorting", to_step_key: "client_selection" }]);
    expect(workflow.stepRuns.get("run-1:original_delivery")).toMatchObject({ status: "in_progress" });
    expect(db.tables.workflow_runs[0]).toMatchObject({ next_action: "next:original_delivery" });
  });

  it("moves selection to internal raw matching and RAW completion to retouching", async () => {
    workflow.run.current_step_key = "client_selection";
    const db = createDb({
      photo_storage_projects: [{ id: "project-1", workflow_run_id: "run-1" }],
      select_galleries: [{ id: "gallery-1", photo_storage_project_id: "project-1", status: "selection_submitted" }],
      workflow_runs: [{ id: "run-1", current_step_key: "client_selection" }],
      workflow_step_runs: [],
    });
    const { syncSelectionSubmittedWorkflow, syncRawMatchWorkflow } = await import("@/lib/photo-storage/shootingProgress");

    await syncSelectionSubmittedWorkflow(db as any, "run-1");
    expect(workflow.advances.at(-1)).toMatchObject({ from_step_key: "client_selection", to_step_key: "raw_matching" });
    expect(workflow.run.current_step_key).toBe("raw_matching");

    await syncRawMatchWorkflow(db as any, { projectId: "project-1", jobStatus: "COMPLETED" });
    expect(db.tables.select_galleries[0]).toMatchObject({ status: "raw_matched" });
    expect(workflow.advances.at(-1)).toMatchObject({ from_step_key: "raw_matching", to_step_key: "retouching" });
  });
});
