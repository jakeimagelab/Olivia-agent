import { describe, expect, it } from "vitest";
import { buildStatusPanelCollections, isTransientRemoteJobFailure, loadSchemaWarningEntries, photoSortingHref } from "./panelService";
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

  it("사진 승인 줄에서 기존 API만 호출하고 정확한 폴더를 연다", () => {
    const result = buildStatusPanelCollections({
      diagnostics,
      photoProjects: [{
        id: "photo-1",
        project_name: "0927_BLS_TEST",
        source_relative_path: "0927_BLS_TEST/원본",
        status: "READY",
        workflow_run_id: null,
        jpg_count: 342,
        updated_at: "2026-09-27T01:00:00.000Z",
      }],
    });
    expect(result.myTurn[0]).toEqual(expect.objectContaining({
      href: "/photo-sorting?remoteFolder=0927_BLS_TEST%2F%EC%9B%90%EB%B3%B8",
      createdAt: "2026-09-27T01:00:00.000Z",
    }));
    expect(result.myTurn[0]?.actions).toEqual([
      expect.objectContaining({ endpoint: "/api/photo-storage/projects/photo-1/approve", kind: "api" }),
      expect.objectContaining({ endpoint: "/api/photo-storage/projects/photo-1/defer", kind: "api" }),
      expect.objectContaining({ href: "/photo-sorting?remoteFolder=0927_BLS_TEST%2F%EC%9B%90%EB%B3%B8", kind: "open" }),
    ]);
    expect(result.myTurn[0]?.actions?.some((action) => action.auto)).toBe(false);
  });

  it("폴더 딥링크를 remoteFolder 쿼리로 인코딩한다", () => {
    expect(photoSortingHref("0927 르셀/원본")).toBe("/photo-sorting?remoteFolder=0927%20%EB%A5%B4%EC%85%80%2F%EC%9B%90%EB%B3%B8");
    expect(photoSortingHref(null)).toBe("/photo-sorting");
  });

  it("네트워크 계열 오류만 일시적 실패로 분류한다", () => {
    expect(isTransientRemoteJobFailure("curl exit code 28: operation timed out")).toBe(true);
    expect(isTransientRemoteJobFailure("ECONNREFUSED worker bridge")).toBe(true);
    expect(isTransientRemoteJobFailure("permission denied")).toBe(false);
    expect(isTransientRemoteJobFailure("disk is full")).toBe(false);
    expect(isTransientRemoteJobFailure("corrupt image")).toBe(false);
  });

  it("첫 일시적 실패에만 자동 재시도 1회를 붙이고 두 번째 실패에는 붙이지 않는다", () => {
    const project = {
      id: "photo-1",
      project_name: "0927_BLS_TEST",
      source_relative_path: "0927_BLS_TEST",
      status: "COPY_FAILED",
      workflow_run_id: null,
      updated_at: "2026-09-27T01:00:00.000Z",
    };
    const failedJob = {
      id: "job-1",
      action: "PHOTO_STAGE_JPG",
      status: "FAILED",
      payload: { project_id: "photo-1" },
      progress: null,
      message: null,
      error: "curl=28 operation timed out",
      created_at: "2026-09-27T01:00:00.000Z",
      completed_at: "2026-09-27T01:01:00.000Z",
    };
    const first = buildStatusPanelCollections({ diagnostics, photoProjects: [project], remoteJobs: [failedJob] });
    expect(first.panelIssues.find((entry) => entry.kind === "photo_failure")?.actions).toContainEqual(expect.objectContaining({
      endpoint: "/api/photo-storage/projects/photo-1/retry",
      auto: true,
    }));

    const second = buildStatusPanelCollections({
      diagnostics,
      photoProjects: [project],
      remoteJobs: [
        { ...failedJob, id: "job-2", created_at: "2026-09-27T01:02:00.000Z" },
        failedJob,
      ],
    });
    expect(second.panelIssues.find((entry) => entry.kind === "photo_failure")?.actions?.some((action) => action.auto)).toBe(false);
  });

  it("진행 중 원격 잡에 기존 진행 컴포넌트용 데이터와 폴더 대상을 싣는다", () => {
    const result = buildStatusPanelCollections({
      diagnostics,
      photoProjects: [{
        id: "photo-1",
        project_name: "0927_BLS_TEST",
        source_relative_path: "0927_BLS_TEST",
        status: "CLASSIFYING",
        workflow_run_id: null,
        updated_at: "2026-09-27T01:00:00.000Z",
      }],
      remoteJobs: [{
        id: "job-1",
        action: "PHOTO_CLASSIFY_WORK",
        status: "RUNNING",
        payload: { project_id: "photo-1", source_relative_path: "0927_BLS_TEST" },
        progress: { stage: "ANALYZING", current: 142, total: 380, message: "경계 검증 142/380" },
        message: "경계 검증 142/380",
        error: null,
        created_at: "2026-09-27T01:00:00.000Z",
        completed_at: null,
      }],
    });
    expect(result.progress[0]).toEqual(expect.objectContaining({
      href: "/photo-sorting?remoteFolder=0927_BLS_TEST",
      progressPercent: 37,
      remoteJob: expect.objectContaining({ id: "job-1", status: "RUNNING" }),
    }));
    expect(result.progress).toHaveLength(1);
  });

  it("NAS watcher 안정화 시간을 진행 줄과 대상 폴더 링크로 표시한다", () => {
    const result = buildStatusPanelCollections({
      diagnostics,
      watcherProgress: {
        version: 1,
        scannedAt: "2026-09-27T02:00:00.000Z",
        sourceStatus: "ONLINE",
        stabilizing: [{ projectName: "0927_BLS_TEST", elapsedSeconds: 45, targetSeconds: 90 }],
      },
    });
    expect(result.progress).toContainEqual(expect.objectContaining({
      kind: "watcher_stabilizing",
      title: "0927_BLS_TEST · 복사 확인 중 45/90초",
      href: "/photo-sorting?remoteFolder=0927_BLS_TEST",
      progressPercent: 50,
    }));
  });

  it("진단이 지정한 저장소 migration만 SQL 복사 액션으로 제공한다", async () => {
    const entries = await loadSchemaWarningEntries({
      ...diagnostics,
      items: [{
        id: "table_worker_events",
        group: "database",
        label: "Worker 이벤트 테이블",
        level: "warning",
        state: "MISSING",
        migration: "supabase/migrations/20260917_worker_events.sql",
      }],
    });
    expect(entries[0]).toEqual(expect.objectContaining({
      id: "diagnostic:table_worker_events",
      actions: expect.arrayContaining([
        expect.objectContaining({ kind: "copy", value: expect.stringContaining("create table if not exists public.worker_events") }),
        expect.objectContaining({ kind: "external" }),
      ]),
    }));
  });
});
