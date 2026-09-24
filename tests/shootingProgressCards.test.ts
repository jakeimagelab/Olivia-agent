import { describe, expect, it } from "vitest";
import { buildShootingProgressCards } from "@/lib/photo-storage/shootingProgressCards";
import type { PhotoStorageProject } from "@/lib/photo-storage/types";

function project(overrides: Partial<PhotoStorageProject> = {}): PhotoStorageProject {
  return {
    id: "project-1",
    project_name: "0911_WINF",
    source_relative_path: "0911_WINF",
    status: "CLASSIFY_COMPLETED",
    raw_count: 1_375,
    jpg_count: 1_375,
    jpg_bytes: 1,
    fingerprint: null,
    discovered_at: "2026-09-11T10:00:00.000Z",
    prepared_at: null,
    approved_at: null,
    approved_by: null,
    created_at: "2026-09-11T10:00:00.000Z",
    updated_at: "2026-09-12T10:00:00.000Z",
    work_relative_path: null,
    copy_started_at: null,
    copy_completed_at: null,
    copied_jpg_count: 0,
    copied_jpg_bytes: 0,
    copy_error: null,
    copy_progress: {},
    copy_job_id: null,
    scene_count: 0,
    classified_jpg_count: 1_375,
    classification_started_at: null,
    classification_completed_at: "2026-09-12T10:00:00.000Z",
    classification_error: null,
    classification_progress: {},
    classify_job_id: null,
    merge_job_id: null,
    merge_started_at: null,
    merge_completed_at: null,
    merged_jpg_count: 1_375,
    merge_conflict_count: 0,
    raw_untouched_count: 1_375,
    merge_error: null,
    merge_progress: {},
    merge_approved_at: null,
    classify_approved_at: null,
    nas_department: "dermatology",
    nas_shooting_mode: "field",
    workflow_run_id: null,
    calendar_task_id: null,
    notification_deferred_until: null,
    notification_dismissed_at: null,
    ...overrides,
  };
}

describe("shooting progress home cards", () => {
  it("keeps a classified project visible without a workflow run", () => {
    const cards = buildShootingProgressCards({ projects: [project()] });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      projectName: "0911_WINF",
      workflowRunId: null,
      stage: "original_delivery",
      stageLabel: "1차 전달",
      actionRequired: true,
    });
    expect(cards[0].detail).toContain("고객 미연결");
    expect(cards[0].summary).toContain("유그린 링크");
  });

  it("shows the internal original_delivery step instead of collapsing it into client selection", () => {
    const cards = buildShootingProgressCards({
      projects: [project({ workflow_run_id: "run-1" })],
      workflows: [{
        id: "run-1",
        client_name: "WINF",
        shoot_date: "2026-09-11",
        current_step_key: "client_selection",
        status: "active",
      }],
      stepRuns: [{ workflow_run_id: "run-1", step_key: "original_delivery", status: "in_progress" }],
    });

    expect(cards[0]).toMatchObject({ stage: "original_delivery", stageLabel: "1차 전달" });
  });

  it("derives selection and RAW matching cards without requiring a workflow", () => {
    const selection = buildShootingProgressCards({
      projects: [project()],
      galleries: [{
        id: "gallery-1",
        photo_storage_project_id: "project-1",
        status: "waiting_selection",
        selected_count: 128,
        updated_at: "2026-09-12T00:00:00.000Z",
      }],
      nowMs: new Date("2026-09-23T00:00:00.000Z").getTime(),
    });
    expect(selection[0]).toMatchObject({ stage: "client_selection", actionRequired: false });
    expect(selection[0].summary).toContain("12일째 · 현재 128장");

    const raw = buildShootingProgressCards({
      projects: [project()],
      rawJobs: [{ id: "job-1", status: "RUNNING", payload: { project_id: "project-1" } }],
    });
    expect(raw[0]).toMatchObject({ stage: "raw_matching", tone: "progress" });
  });

  it("sorts action-needed work first and removes completed workflow cards", () => {
    const cards = buildShootingProgressCards({
      projects: [
        project({ id: "waiting", project_name: "0910_WAIT", workflow_run_id: "run-wait", updated_at: "2026-09-24T00:00:00.000Z" }),
        project({ id: "action", project_name: "0911_ACTION", updated_at: "2026-09-11T00:00:00.000Z" }),
        project({ id: "done", project_name: "0901_DONE", workflow_run_id: "run-done" }),
      ],
      workflows: [
        { id: "run-wait", current_step_key: "client_selection", status: "active" },
        { id: "run-done", current_step_key: "reward", status: "completed" },
      ],
      galleries: [{ id: "gallery-wait", workflow_run_id: "run-wait", status: "waiting_selection" }],
    });

    expect(cards.map((card) => card.projectId)).toEqual(["action", "waiting"]);
  });
});
