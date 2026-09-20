import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { RemoteNasDataSource } from "@/lib/remote-nas/types";

type Row = Record<string, unknown>;

function createFakeTable(rows: Row[]) {
  return {
    query(operation: "select" | "update" | "insert", payload?: Row) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        eq(col: string, val: unknown) { filters.push((row) => row[col] === val); return builder; },
        order() { return builder; },
        limit(n: number) { filters.push(() => true); void n; return builder; },
        select() { return builder; },
        async maybeSingle() {
          if (operation === "insert") {
            const inserted = { id: `project-${rows.length + 1}`, ...payload };
            rows.push(inserted);
            return { data: inserted, error: null };
          }
          const matches = rows.filter((row) => filters.every((f) => f(row)));
          if (operation === "update") for (const row of matches) Object.assign(row, payload);
          return { data: matches[0] ?? null, error: null };
        },
        async single() {
          const result = await builder.maybeSingle();
          return result.data ? result : { data: null, error: new Error("not found") };
        },
        then(resolve: (result: { data: Row[]; error: null }) => void) {
          const matches = rows.filter((row) => filters.every((f) => f(row)));
          if (operation === "update") for (const row of matches) Object.assign(row, payload);
          resolve({ data: matches, error: null });
        },
      };
      return builder;
    },
  };
}

const state = vi.hoisted(() => ({
  events: [] as Row[],
  projects: [] as Row[],
}));

function remoteFolders(names = ["0917_청담스시"]): RemoteNasDataSource {
  return {
    async listFolder(relativePath) {
      const entries = relativePath === ""
        ? names.map((name) => ({ kind: "directory" as const, name, path: name, displayName: name, displayPath: name, sizeBytes: null, modifiedAt: "2026-09-20T00:00:00.000Z" }))
        : [
            { kind: "file" as const, name: "A001.JPG", path: `${relativePath}/A001.JPG`, displayName: "A001.JPG", displayPath: `${relativePath}/A001.JPG`, sizeBytes: 100, modifiedAt: "2026-09-20T00:00:00.000Z" },
            { kind: "file" as const, name: "A001.ARW", path: `${relativePath}/A001.ARW`, displayName: "A001.ARW", displayPath: `${relativePath}/A001.ARW`, sizeBytes: 300, modifiedAt: "2026-09-20T00:00:00.000Z" },
          ];
      return {
        rootName: "Workstation(M.2SSD)" as const,
        path: relativePath,
        displayPath: relativePath,
        entries,
        connection: { macStudio: "online" as const, nas: "connected" as const, source: "worker" as const },
        readOnly: true as const,
      };
    },
  };
}

const defaultDependencies = () => ({ dataSource: remoteFolders() });

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    const tables = {
      worker_events: createFakeTable(state.events),
      photo_storage_projects: createFakeTable(state.projects),
    };
    return {
      from(table: keyof typeof tables) {
        const fake = tables[table];
        if (!fake) throw new Error(`unexpected table: ${table}`);
        return {
          update: (patch: Row) => fake.query("update", patch),
          select: () => fake.query("select"),
          insert: (row: Row) => fake.query("insert", row),
        };
      },
    };
  },
}));

import { executeNasBackupTool, NAS_BACKUP_TOOL_NAMES } from "@/lib/olivia/v2/toolExecutors/nasBackup";

const context = { recentActions: [], revision: 0 };

describe("NAS Backup Watcher 신규 tool — watcher 자체는 안 건드리고 조회+승인된 후속 작업만", () => {
  it("기존 4개와 사진 채팅 실행 3개 tool 이름을 노출한다", () => {
    expect(NAS_BACKUP_TOOL_NAMES).toEqual([
      "nas_backup_status", "nas_backup_recent", "nas_backup_get", "nas_backup_start_sort",
      "find_photo_folder", "start_photo_source_prep", "start_photo_scene_sort",
    ]);
  });

  it("nas_backup_status는 상태별 개수를 집계하고 PENDING 존재 여부를 요약한다", async () => {
    state.events.length = 0;
    state.events.push({ id: "1", status: "PENDING" }, { id: "2", status: "PENDING" }, { id: "3", status: "STARTED" });
    const result = await executeNasBackupTool("nas_backup_status", {}, context);
    expect(result).toMatchObject({ success: true, data: { pendingCount: 2, byStatus: { PENDING: 2, STARTED: 1 } } });
  });

  it("nas_backup_status는 PENDING이 없으면 그렇게 요약한다", async () => {
    state.events.length = 0;
    state.events.push({ id: "1", status: "COMPLETED" });
    const result = await executeNasBackupTool("nas_backup_status", {}, context);
    expect((result.data as any).pendingCount).toBe(0);
    expect((result.data as any).summary).toContain("없어요");
  });

  it("nas_backup_recent는 최근 이벤트 목록을 반환한다", async () => {
    state.events.length = 0;
    state.events.push({ id: "1", status: "PENDING", folder_name: "0917_청담스시" });
    const result = await executeNasBackupTool("nas_backup_recent", { limit: 5 }, context);
    expect(result).toMatchObject({ success: true, data: { events: [{ id: "1", folder_name: "0917_청담스시" }] } });
  });

  it("nas_backup_get은 id로 단건 조회하고, 없으면 실패한다", async () => {
    state.events.length = 0;
    state.events.push({ id: "evt-1", status: "PENDING" });
    const result = await executeNasBackupTool("nas_backup_get", { id: "evt-1" }, context);
    expect(result).toMatchObject({ success: true, data: { event: { id: "evt-1" } } });
    await expect(executeNasBackupTool("nas_backup_get", { id: "no-such" }, context)).rejects.toThrow();
  });

  it("nas_backup_start_sort는 department/shootingMode 없이는 실행되지 않는다(추측 금지)", async () => {
    await expect(executeNasBackupTool("nas_backup_start_sort", { folderName: "0917_청담스시" }, context, defaultDependencies())).rejects.toThrow(/진료과/);
    await expect(executeNasBackupTool("nas_backup_start_sort", { folderName: "0917_청담스시", department: "dermatology" }, context, defaultDependencies())).rejects.toThrow(/촬영 모드/);
  });

  it("find_photo_folder는 행 없는 옛날 폴더를 UNREGISTERED로 보여주지만 행은 만들지 않는다", async () => {
    state.projects.length = 0;
    const result = await executeNasBackupTool("find_photo_folder", { query: "청담스시" }, context, defaultDependencies());
    expect(result).toMatchObject({ success: true, data: { candidates: [{ projectStatus: "UNREGISTERED", fileCount: 2, jpgCount: 1, rawCount: 1 }] } });
    expect(state.projects).toHaveLength(0);
  });

  it("start_photo_source_prep은 행 없는 옛날 폴더를 명시적으로 시작할 때만 프로젝트 행을 만든다", async () => {
    state.projects.length = 0;
    const result = await executeNasBackupTool("start_photo_source_prep", {
      folderName: "0917_청담스시", confirmRestart: false,
    }, context, defaultDependencies());
    expect(result).toMatchObject({
      success: true,
      data: { createdProject: true, status: "MERGE_APPROVED", summary: "작업을 시작했습니다. 진행 중입니다." },
    });
    expect(state.projects).toMatchObject([{
      source_relative_path: "0917_청담스시", status: "MERGE_APPROVED", raw_count: 1, jpg_count: 1, jpg_bytes: 100,
    }]);
  });

  it("find 직후 정확한 후보로 시작할 때 Workstation 전체를 중복 스캔하지 않는다", async () => {
    state.projects.length = 0;
    const folderName = "0918_중복스캔방지";
    const base = remoteFolders([folderName]);
    const listFolder = vi.fn(base.listFolder.bind(base));
    const dataSource: RemoteNasDataSource = { listFolder };
    const dependencies = { dataSource };

    const found = await executeNasBackupTool("find_photo_folder", { query: "중복스캔방지" }, context, dependencies);
    expect(found).toMatchObject({ success: true, data: { candidates: [{ sourceRelativePath: folderName }] } });
    expect(listFolder).toHaveBeenCalledTimes(2);

    const started = await executeNasBackupTool("start_photo_source_prep", {
      folderName,
      confirmRestart: false,
    }, context, dependencies);

    expect(started).toMatchObject({ success: true, data: { status: "MERGE_APPROVED", createdProject: true } });
    expect(listFolder).toHaveBeenCalledTimes(2);
  });

  it("부분 이름이 여러 폴더에 걸리면 프로젝트 행과 job 의도를 만들지 않는다", async () => {
    state.projects.length = 0;
    const dependencies = { dataSource: remoteFolders(["0730_르셀청담", "0812_르셀청담"]) };
    await expect(executeNasBackupTool("start_photo_source_prep", {
      folderName: "르셀청담", confirmRestart: false,
    }, context, dependencies)).rejects.toMatchObject({ code: "AMBIGUOUS_PHOTO_FOLDER" });
    expect(state.projects).toHaveLength(0);
  });

  it("이미 JPG 통합이 끝난 폴더는 확인 없이 다시 MERGE_APPROVED로 되돌리지 않는다", async () => {
    state.projects.length = 0;
    state.projects.push({ id: "merged-1", project_name: "0917_청담스시", source_relative_path: "0917_청담스시", status: "MERGE_COMPLETED" });
    await expect(executeNasBackupTool("start_photo_source_prep", {
      folderName: "0917_청담스시", confirmRestart: false,
    }, context, defaultDependencies())).rejects.toMatchObject({ code: "PHOTO_PROJECT_RESTART_CONFIRMATION_REQUIRED" });
    expect(state.projects[0].status).toBe("MERGE_COMPLETED");

    const confirmed = await executeNasBackupTool("start_photo_source_prep", {
      folderName: "0917_청담스시", confirmRestart: true,
    }, context, defaultDependencies());
    expect(confirmed).toMatchObject({ success: true, data: { status: "MERGE_APPROVED", createdProject: false } });
    expect(state.projects[0].status).toBe("MERGE_APPROVED");
  });

  // 코드 요청서(2026-09-18) 작업 D — 옛날 단일 PHOTO_SORT job(구식 RAW/JPG/SELECT) 대신 PHASE 6
  // 파이프라인(photo_storage_projects를 MERGE_APPROVED로) 에 연결한다. 이후 단계(MERGE→COPY→
  // CLASSIFY)는 건드리지 않는 기존 claim RPC들이 이어받으므로 여기서는 최초 row만 검증한다.
  it("nas_backup_start_sort는 photo_storage_projects를 MERGE_APPROVED로 만들고 nas_department/nas_shooting_mode를 채운다(씬별분류 파이프라인, 새 분류 엔진 아님)", async () => {
    state.projects.length = 0;
    const result = await executeNasBackupTool("nas_backup_start_sort", {
      folderName: "0917_청담스시", department: "dermatology", shootingMode: "field", confirmRestart: false,
    }, context, defaultDependencies());
    expect(result).toMatchObject({ success: true, data: { projectId: "project-1" }, verification: { persisted: true } });
    expect(state.projects).toMatchObject([{
      source_relative_path: "0917_청담스시",
      status: "MERGE_APPROVED",
      nas_department: "dermatology",
      nas_shooting_mode: "field",
      classify_approved_at: expect.any(String),
    }]);
  });

  it("nas_backup_start_sort는 같은 폴더가 이미 있으면(다른 watcher가 만든 row 포함) 새로 만들지 않고 기존 row에 nas_department를 채운다", async () => {
    state.projects.length = 0;
    state.projects.push({ id: "existing-1", source_relative_path: "0917_청담스시", status: "READY" });
    const result = await executeNasBackupTool("nas_backup_start_sort", {
      folderName: "0917_청담스시", department: "dermatology", shootingMode: "studio", confirmRestart: false,
    }, context, defaultDependencies());
    expect((result.data as any).projectId).toBe("existing-1");
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]).toMatchObject({ status: "MERGE_APPROVED", nas_department: "dermatology", nas_shooting_mode: "studio" });
  });

  it("nas_backup_start_sort는 이미 진행 중/완료된 row는 상태를 되돌리지 않는다(중복 실행 방지)", async () => {
    state.projects.length = 0;
    state.projects.push({ id: "existing-2", source_relative_path: "0917_청담스시", status: "COPYING" });
    await executeNasBackupTool("nas_backup_start_sort", {
      folderName: "0917_청담스시", department: "dermatology", shootingMode: "field", confirmRestart: false,
    }, context, defaultDependencies());
    expect(state.projects[0]).toMatchObject({ status: "COPYING", nas_department: "dermatology" });
  });

  it("nas_backup_start_sort는 eventId가 있으면 worker_events를 STARTED로 표시한다(watcher 자체는 안 건드림, 상태 컬럼만)", async () => {
    state.projects.length = 0;
    state.events.length = 0;
    state.events.push({ id: "evt-9", status: "PENDING" });
    await executeNasBackupTool("nas_backup_start_sort", {
      folderName: "0917_청담스시", department: "dermatology", shootingMode: "field", eventId: "evt-9", confirmRestart: false,
    }, context, defaultDependencies());
    expect(state.events[0]).toMatchObject({ id: "evt-9", status: "STARTED" });
  });
});
