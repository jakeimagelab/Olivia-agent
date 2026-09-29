import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

function createFakeTable(rows: Row[]) {
  return {
    query(operation: "select" | "update" | "insert", payload?: Row) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        eq(col: string, val: unknown) { filters.push((row) => row[col] === val); return builder; },
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

let currentDb: any = null;
function createFakeSupabase(store: { events: Row[]; projects: Row[] }) {
  const tables = {
    worker_events: createFakeTable(store.events),
    photo_storage_projects: createFakeTable(store.projects),
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

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => currentDb }));

let adminSession = true;
vi.mock("@/lib/passkey", () => ({ isAdminSession: () => adminSession }));

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

async function postStart(id: string, body: unknown) {
  const { POST } = await import("@/app/api/worker/events/[id]/start-classification/route");
  return POST(
    new NextRequest(`http://localhost/api/worker/events/${id}/start-classification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

let store: { events: Row[]; projects: Row[] };
beforeEach(() => {
  adminSession = true;
  store = { events: [{ id: EVENT_ID, folder_name: "0917_청담스시", status: "PENDING" }], projects: [] };
  currentDb = createFakeSupabase(store);
});

// 알림 카드의 "[전체 분류 시작]" 버튼이 부르는 경량 API. 진료과는 폴더명/고객에서
// 자동으로 정하고, 현장·스튜디오는 사진별로 판정하므로 입력 파라미터로 받지 않는다.
describe("POST /api/worker/events/[id]/start-classification", () => {
  it("관리자 세션이 아니면 401", async () => {
    adminSession = false;
    const response = await postStart(EVENT_ID, {});
    expect(response.status).toBe(401);
  });

  it("진료과와 촬영방식 없이도 전체 분류를 시작한다", async () => {
    const response = await postStart(EVENT_ID, { only: "all" });
    expect(response.status).toBe(200);
  });

  it("옛 shootingMode 값은 작업 판정에 사용하지 않는다", async () => {
    const response = await postStart(EVENT_ID, { shootingMode: "outdoor", only: "연출" });
    // 연출정리는 JPG정리 전에는 막힌다. 409의 원인은 shootingMode가 아니라 JPG정리 선행 조건이다.
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PHOTO_JPG_PREP_REQUIRED" });
  });

  it("존재하지 않는 이벤트면 404", async () => {
    const response = await postStart("22222222-2222-4222-8222-222222222222", {});
    expect(response.status).toBe(404);
  });

  it("정상 요청이면 photo_storage_projects를 MERGE_APPROVED로 만들고 worker_events를 STARTED로 표시한다", async () => {
    const response = await postStart(EVENT_ID, {});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("MERGE_APPROVED");

    expect(store.projects).toMatchObject([{
      source_relative_path: "0917_청담스시",
      status: "MERGE_APPROVED",
      nas_department: "general",
      nas_shooting_mode: "field",
      classify_approved_at: expect.any(String),
    }]);
    expect(store.events).toMatchObject([{ id: EVENT_ID, status: "STARTED" }]);
  });

  it("기존 실패 프로젝트는 알림 버튼에서도 재확인을 받은 뒤 같은 helper로 재시작한다", async () => {
    store.projects.push({
      id: "project-failed",
      project_name: "0917_청담스시",
      source_relative_path: "0917_청담스시",
      status: "MERGE_FAILED",
    });

    const first = await postStart(EVENT_ID, { confirmRestart: false });
    expect(first.status).toBe(409);
    expect(await first.json()).toMatchObject({ code: "PHOTO_PROJECT_RESTART_CONFIRMATION_REQUIRED" });
    expect(store.projects[0].status).toBe("MERGE_FAILED");

    const confirmed = await postStart(EVENT_ID, { confirmRestart: true });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ ok: true, status: "MERGE_APPROVED" });
    expect(store.projects[0]).toMatchObject({ status: "MERGE_APPROVED", classify_approved_at: expect.any(String) });
    expect(store.events[0]).toMatchObject({ status: "STARTED" });
  });
});
