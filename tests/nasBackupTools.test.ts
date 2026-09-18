import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  events: [] as Array<Record<string, any>>,
  updateCalls: [] as Array<{ id: string; patch: Record<string, any> }>,
  createJobInput: null as any,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "worker_events") throw new Error(`unexpected table: ${table}`);
      const builder: any = {
        _rows: state.events,
        select: () => builder,
        order: () => builder,
        limit: (n: number) => { builder._rows = builder._rows.slice(0, n); return builder; },
        eq: (key: string, value: unknown) => { builder._rows = builder._rows.filter((row: any) => row[key] === value); return builder; },
        update: (patch: Record<string, any>) => ({
          eq: async (key: string, value: unknown) => {
            state.updateCalls.push({ id: value as string, patch });
            return { data: null, error: null };
          },
        }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: builder._rows, error: null })),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/photo-classifier/remotePhotoSort", () => ({
  createRemotePhotoSortJob: vi.fn(async (input: any) => {
    state.createJobInput = input;
    return { id: "job-1", action: "PHOTO_SORT", status: "QUEUED", result: null, message: null, error: null, progress: null };
  }),
}));

import { executeNasBackupTool, NAS_BACKUP_TOOL_NAMES } from "@/lib/olivia/v2/toolExecutors/nasBackup";

const context = { recentActions: [], revision: 0 };

describe("NAS Backup Watcher 신규 tool — watcher 자체는 안 건드리고 조회+승인된 후속 작업만", () => {
  it("4개 tool 이름을 노출한다", () => {
    expect(NAS_BACKUP_TOOL_NAMES).toEqual(["nas_backup_status", "nas_backup_recent", "nas_backup_get", "nas_backup_start_sort"]);
  });

  it("nas_backup_status는 상태별 개수를 집계하고 PENDING 존재 여부를 요약한다", async () => {
    state.events = [
      { id: "1", status: "PENDING" }, { id: "2", status: "PENDING" }, { id: "3", status: "STARTED" },
    ];
    const result = await executeNasBackupTool("nas_backup_status", {}, context);
    expect(result).toMatchObject({ success: true, data: { pendingCount: 2, byStatus: { PENDING: 2, STARTED: 1 } } });
  });

  it("nas_backup_status는 PENDING이 없으면 그렇게 요약한다", async () => {
    state.events = [{ id: "1", status: "COMPLETED" }];
    const result = await executeNasBackupTool("nas_backup_status", {}, context);
    expect((result.data as any).pendingCount).toBe(0);
    expect((result.data as any).summary).toContain("없어요");
  });

  it("nas_backup_recent는 최근 이벤트 목록을 반환한다", async () => {
    state.events = [{ id: "1", status: "PENDING", folder_name: "0917_청담스시" }];
    const result = await executeNasBackupTool("nas_backup_recent", { limit: 5 }, context);
    expect(result).toMatchObject({ success: true, data: { events: [{ id: "1", folder_name: "0917_청담스시" }] } });
  });

  it("nas_backup_get은 id로 단건 조회하고, 없으면 실패한다", async () => {
    state.events = [{ id: "evt-1", status: "PENDING" }];
    const result = await executeNasBackupTool("nas_backup_get", { id: "evt-1" }, context);
    expect(result).toMatchObject({ success: true, data: { event: { id: "evt-1" } } });
    await expect(executeNasBackupTool("nas_backup_get", { id: "no-such" }, context)).rejects.toThrow();
  });

  it("nas_backup_start_sort는 department/shootingMode 없이는 실행되지 않는다(추측 금지)", async () => {
    await expect(executeNasBackupTool("nas_backup_start_sort", { folderName: "0917_청담스시" }, context)).rejects.toThrow(/진료과/);
    await expect(executeNasBackupTool("nas_backup_start_sort", { folderName: "0917_청담스시", department: "dermatology" }, context)).rejects.toThrow(/촬영 모드/);
  });

  it("nas_backup_start_sort는 folderName을 그대로 source_folder로 전달해 기존 PHOTO_SORT job을 생성한다(1:1 매핑, 새 분류 엔진 아님)", async () => {
    state.createJobInput = null;
    const result = await executeNasBackupTool("nas_backup_start_sort", {
      folderName: "0917_청담스시", department: "dermatology", shootingMode: "field",
    }, context);
    expect(result).toMatchObject({ success: true, data: { jobId: "job-1" }, verification: { persisted: true } });
    expect(state.createJobInput).toMatchObject({ source_folder: "0917_청담스시", department: "dermatology", shooting_mode: "field" });
  });

  it("nas_backup_start_sort는 eventId가 있으면 worker_events를 STARTED로 표시한다(watcher 자체는 안 건드림, 상태 컬럼만)", async () => {
    state.updateCalls = [];
    await executeNasBackupTool("nas_backup_start_sort", {
      folderName: "0917_청담스시", department: "dermatology", shootingMode: "field", eventId: "evt-9",
    }, context);
    expect(state.updateCalls).toEqual([{ id: "evt-9", patch: { status: "STARTED" } }]);
  });
});
