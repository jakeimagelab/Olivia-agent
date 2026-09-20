import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { eventForStatus, validatePhotoProjectRelativePath } from "@/lib/photo-storage/server";
import { syncPhotoMergeProject } from "@/lib/photo-storage/mergeSync";

type Row = Record<string, unknown>;

function createFakeTable(rows: Row[]) {
  return {
    query(operation: "select" | "update" | "insert", payload?: Row) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        eq(col: string, val: unknown) { filters.push((row) => row[col] === val); return builder; },
        in(col: string, vals: unknown[]) { filters.push((row) => vals.includes(row[col])); return builder; },
        neq(col: string, val: unknown) { filters.push((row) => row[col] !== val); return builder; },
        order() { return builder; },
        limit() { return builder; },
        select() { return builder; },
        async maybeSingle() {
          if (operation === "insert") {
            const inserted = { id: `evt-${rows.length + 1}`, ...payload };
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

function createFakeSupabase(store: { projects: Row[]; events: Row[] }) {
  const tables = {
    photo_storage_projects: createFakeTable(store.projects),
    photo_storage_events: createFakeTable(store.events),
  };
  return {
    from(table: keyof typeof tables) {
      const fake = tables[table];
      return {
        update: (patch: Row) => fake.query("update", patch),
        select: () => fake.query("select"),
        insert: (row: Row) => fake.query("insert", row),
      };
    },
  };
}

let currentDb: ReturnType<typeof createFakeSupabase> | null = null;
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => currentDb,
}));
vi.mock("@/lib/passkey", () => ({
  isAdminSession: () => true,
}));

function baseProject(overrides: Row = {}): Row {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    project_name: "0915_포토클리닉",
    source_relative_path: "0915_포토클리닉",
    status: "READY",
    raw_count: 10,
    jpg_count: 10,
    jpg_bytes: 1000,
    merged_jpg_count: 0,
    merge_conflict_count: 0,
    raw_untouched_count: 0,
    scene_count: 0,
    classified_jpg_count: 0,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function postApprove(id: string) {
  const { POST } = await import("@/app/api/photo-storage/projects/[id]/approve/route");
  return POST(new NextRequest(`http://localhost/api/photo-storage/projects/${id}/approve`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

async function postRetry(id: string) {
  const { POST } = await import("@/app/api/photo-storage/projects/[id]/retry/route");
  return POST(new NextRequest(`http://localhost/api/photo-storage/projects/${id}/retry`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  currentDb = null;
});

describe("photo storage server guards", () => {
  it("preserves raw relative paths, including unicode normalization form", () => {
    const nfd = "0914_강남성모안과".normalize("NFD");
    expect(validatePhotoProjectRelativePath(nfd)).toBe(nfd);
    expect(validatePhotoProjectRelativePath("0914_강남성모안과/JPG원본")).toBe("0914_강남성모안과/JPG원본");
  });

  it.each(["/Volumes/PHOTO_MAIN/shoot", "/Users/mac/shoot", "../shoot", "shoot/../other", "shoot\\other", "shoot//JPG"]) (
    "rejects unsafe source path %s",
    (value) => expect(() => validatePhotoProjectRelativePath(value)).toThrow(),
  );

  it("maps lifecycle statuses to stable event types", () => {
    expect(eventForStatus("READY")).toMatchObject({ type: "PHOTO_PROJECT_READY", requiresAction: true });
    expect(eventForStatus("DEFERRED")).toMatchObject({ type: "PHOTO_PROJECT_DEFERRED", requiresAction: false });
    expect(eventForStatus("REVIEW_REQUIRED")).toMatchObject({ type: "PHOTO_PROJECT_REVIEW_REQUIRED", requiresAction: true });
  });

  it("maps the PHASE 6 two-step approval statuses to their own event types", () => {
    expect(eventForStatus("MERGE_APPROVED")).toMatchObject({ type: "PHOTO_PROJECT_APPROVED", requiresAction: false });
    expect(eventForStatus("MERGING")).toMatchObject({ type: "PHOTO_MERGE_STARTED", requiresAction: false });
    expect(eventForStatus("MERGE_COMPLETED")).toMatchObject({ type: "PHOTO_MERGE_COMPLETED", requiresAction: true });
    expect(eventForStatus("MERGE_FAILED")).toMatchObject({ type: "PHOTO_MERGE_FAILED", requiresAction: true });
    expect(eventForStatus("CLASSIFY_APPROVED")).toMatchObject({ type: "PHOTO_PROJECT_CLASSIFY_APPROVED", requiresAction: false });
  });
});

describe("PHASE 6 two-step approval gate", () => {
  it("approves READY -> MERGE_APPROVED on first approval", async () => {
    const project = baseProject({ status: "READY" });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postApprove(project.id as string);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.project.status).toBe("MERGE_APPROVED");
    expect(body.project.merge_approved_at).toBeTruthy();
    expect(body.idempotent).toBe(false);
  });

  it("approves MERGE_COMPLETED -> CLASSIFY_APPROVED on second approval", async () => {
    const project = baseProject({ status: "MERGE_COMPLETED", merged_jpg_count: 10 });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postApprove(project.id as string);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.project.status).toBe("CLASSIFY_APPROVED");
    expect(body.project.classify_approved_at).toBeTruthy();
    expect(body.project.approved_at).toBeTruthy();
  });

  it("rejects approval from an in-progress or terminal status with 409", async () => {
    const project = baseProject({ status: "COPYING" });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postApprove(project.id as string);
    expect(response.status).toBe(409);
  });

  it("is idempotent when called again after the transition already happened", async () => {
    const project = baseProject({ status: "MERGE_APPROVED", merge_approved_at: new Date().toISOString() });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postApprove(project.id as string);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.idempotent).toBe(true);
    expect(body.project.status).toBe("MERGE_APPROVED");
  });
});

describe("PHASE 6 retry routing per failed stage", () => {
  it("retries MERGE_FAILED back to MERGE_APPROVED", async () => {
    const project = baseProject({ status: "MERGE_FAILED", merge_error: "충돌" });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postRetry(project.id as string);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.project.status).toBe("MERGE_APPROVED");
    expect(body.project.merge_error).toBeNull();
  });

  it("retries COPY_FAILED back to CLASSIFY_APPROVED", async () => {
    const project = baseProject({ status: "COPY_FAILED", copy_error: "복사 실패" });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postRetry(project.id as string);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.project.status).toBe("CLASSIFY_APPROVED");
  });

  it("retries CLASSIFY_FAILED back to COPY_COMPLETED", async () => {
    const project = baseProject({ status: "CLASSIFY_FAILED", classification_error: "분류 실패" });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postRetry(project.id as string);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.project.status).toBe("COPY_COMPLETED");
  });

  it("infers the merge stage for REVIEW_REQUIRED from merge_error and retries to MERGE_APPROVED", async () => {
    const project = baseProject({ status: "REVIEW_REQUIRED", merge_error: "같은 이름의 JPG가 있습니다.", merge_conflict_count: 2 });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postRetry(project.id as string);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.project.status).toBe("MERGE_APPROVED");
  });

  it("rejects retry from a status with no failure/review to recover from", async () => {
    const project = baseProject({ status: "READY" });
    currentDb = createFakeSupabase({ projects: [project], events: [] });
    const response = await postRetry(project.id as string);
    expect(response.status).toBe(409);
  });
});

describe("JPG 통합 완료 후 승인 의도에 따른 다음 단계", () => {
  it("원본 분리만 승인한 프로젝트는 MERGE_COMPLETED에서 멈춘다", async () => {
    const project = baseProject({ status: "MERGING", merge_job_id: "job-merge" });
    const store = { projects: [project], events: [] as Row[] };
    const db = createFakeSupabase(store);

    await syncPhotoMergeProject(db as any, {
      jobId: "job-merge",
      jobStatus: "COMPLETED",
      payload: { project_id: project.id },
      progress: null,
      result: { status: "JPG_MERGE_COMPLETED", jpgMoved: 10, jpgAlreadyPrepared: 0, rawUntouched: 10 },
    });

    expect(store.projects[0]).toMatchObject({ status: "MERGE_COMPLETED", merged_jpg_count: 10 });
  });

  it("전체 Scene 분류가 승인된 프로젝트는 MERGE 완료 후 CLASSIFY_APPROVED로 넘어간다", async () => {
    const project = baseProject({
      status: "MERGING",
      merge_job_id: "job-merge",
      classify_approved_at: "2026-09-20T00:00:00.000Z",
      nas_department: "dermatology",
      nas_shooting_mode: "field",
    });
    const store = { projects: [project], events: [] as Row[] };
    const db = createFakeSupabase(store);

    await syncPhotoMergeProject(db as any, {
      jobId: "job-merge",
      jobStatus: "COMPLETED",
      payload: { project_id: project.id },
      progress: null,
      result: { status: "JPG_MERGE_COMPLETED", jpgMoved: 10, jpgAlreadyPrepared: 0, rawUntouched: 10 },
    });

    expect(store.projects[0]).toMatchObject({ status: "CLASSIFY_APPROVED", merged_jpg_count: 10, raw_untouched_count: 10 });
    expect(store.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "PHOTO_PROJECT_CLASSIFY_APPROVED" }),
    ]));
  });
});
