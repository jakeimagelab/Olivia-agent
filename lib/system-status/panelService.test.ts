import { describe, expect, it } from "vitest";
import { buildStatusPanelCollections } from "./panelService";
import type { SystemStatusReport } from "./types";

const diagnostics: SystemStatusReport = {
  ok: true,
  checkedAt: "2026-09-27T00:00:00.000Z",
  issueCount: 0,
  summary: "정상",
  items: [],
};

describe("buildStatusPanelCollections", () => {
  it("workflow.blocked 이벤트가 있고 프로젝트가 payment_confirm이면 잔금 대기를 내 차례에 표시한다", () => {
    const result = buildStatusPanelCollections({
      diagnostics,
      workflowRuns: [{
        id: "run-1",
        client_id: "client-1",
        client_name: "기통찬의원",
        project_name: "기통찬 촬영",
        current_step_key: "payment_confirm",
        status: "active",
        updated_at: "2026-09-26T00:00:00.000Z",
      }],
      blockedEvents: [{
        id: "event-1",
        client_id: "client-1",
        workflow_run_id: "run-1",
        payload: { waitingFor: "payment_confirm" },
        occurred_at: "2026-09-26T00:00:00.000Z",
      }],
    });
    expect(result.myTurn).toContainEqual(expect.objectContaining({
      kind: "workflow_blocked",
      workflowRunId: "run-1",
      title: "잔금·계산서 확인 대기 · 기통찬 촬영",
    }));
  });

  it("READY/MERGE_COMPLETED 사진 프로젝트와 pending 승인, failed task를 내 차례로 모은다", () => {
    const result = buildStatusPanelCollections({
      diagnostics,
      photoProjects: [
        { id: "photo-1", project_name: "A", source_relative_path: "A", status: "READY", workflow_run_id: null, updated_at: null },
        { id: "photo-2", project_name: "B", source_relative_path: "B", status: "MERGE_COMPLETED", workflow_run_id: null, updated_at: null },
      ],
      approvals: [{ id: "approval-1", title: "견적 승인", description: null, client_id: null, workflow_run_id: null, created_at: null }],
      failedTasks: [{ id: "task-1", title: "메일 생성", error_message: "실패", client_id: null, workflow_run_id: null, updated_at: null }],
    });
    expect(result.myTurn.map((item) => item.kind)).toEqual([
      "photo_first_approval",
      "photo_second_approval",
      "approval",
      "failed_task",
    ]);
  });
});
