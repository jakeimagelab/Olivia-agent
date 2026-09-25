import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

function createFakeTable(rows: Row[], opts: { failWith?: string } = {}) {
  return {
    // PHASE 4 작업 1 R3(2026-09-25) — hermesFallbackCount24h가 select(col, {count,head})로 head
    // count 모드를 쓰므로, from(table).select(...)에서 넘어온 head 여부를 여기서 받는다.
    query(headCount = false) {
      const filters: Array<(row: Row) => boolean> = [];
      let limitCount: number | undefined;
      const builder = {
        eq(col: string, val: unknown) { filters.push((row) => row[col] === val); return builder; },
        neq(col: string, val: unknown) { filters.push((row) => row[col] !== val); return builder; },
        not(col: string, operator: string, val: unknown) {
          if (operator === "is" && val === null) filters.push((row) => row[col] !== null && row[col] !== undefined);
          return builder;
        },
        gte() { return builder; },
        order() { return builder; },
        limit(n: number) { limitCount = n; return builder; },
        async maybeSingle() {
          if (opts.failWith) return { data: null, error: { message: opts.failWith } };
          const matches = rows.filter((row) => filters.every((f) => f(row)));
          return { data: matches[0] ?? null, error: null };
        },
        then(resolve: (result: { data: Row[] | null; error: { message: string } | null; count?: number }) => void) {
          if (opts.failWith) { resolve({ data: null, error: { message: opts.failWith } }); return; }
          let matches = rows.filter((row) => filters.every((f) => f(row)));
          if (headCount) { resolve({ data: null, error: null, count: matches.length }); return; }
          if (limitCount !== undefined) matches = matches.slice(0, limitCount);
          resolve({ data: matches, error: null });
        },
      };
      return builder;
    },
  };
}

let currentDb: any = null;
function createFakeSupabase(
  tables: { remote_workers: Row[]; worker_events: Row[]; remote_jobs: Row[]; olivia_chat_messages?: Row[] },
  failing: Partial<Record<"remote_workers" | "worker_events" | "remote_jobs" | "olivia_chat_messages", string>> = {},
) {
  const fakes = {
    remote_workers: createFakeTable(tables.remote_workers, { failWith: failing.remote_workers }),
    worker_events: createFakeTable(tables.worker_events, { failWith: failing.worker_events }),
    remote_jobs: createFakeTable(tables.remote_jobs, { failWith: failing.remote_jobs }),
    olivia_chat_messages: createFakeTable(tables.olivia_chat_messages ?? [], { failWith: failing.olivia_chat_messages }),
  };
  return {
    from(table: keyof typeof fakes | "workflow_runs") {
      // findWorkflowConsistencyIssues가 조회하는 workflow_runs 등은 이 테스트의 관심사가
      // 아니다 — 빈 결과로 흘려보내면 그 함수 내부에서 안전하게 issues:[]로 정리된다.
      if (!(table in fakes)) return { select: () => createFakeTable([]).query() };
      return { select: (_columns?: string, options?: { head?: boolean }) => fakes[table as keyof typeof fakes].query(options?.head) };
    },
  };
}

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => currentDb }));

let adminSession = true;
vi.mock("@/lib/passkey", () => ({ isAdminSession: () => adminSession }));

async function callStatusPanel() {
  const { GET } = await import("@/app/api/olivia-os/status-panel/route");
  return GET(new NextRequest("http://localhost/api/olivia-os/status-panel"));
}

beforeEach(() => {
  adminSession = true;
});

describe("GET /api/olivia-os/status-panel", () => {
  it("관리자 세션이 아니면 401", async () => {
    adminSession = false;
    const response = await callStatusPanel();
    expect(response.status).toBe(401);
  });

  it("세 테이블을 정상 조회하면 worker/recentBackups/recentJobs를 채워서 반환한다", async () => {
    const now = new Date().toISOString();
    currentDb = createFakeSupabase({
      remote_workers: [{ worker_id: "jake-macstudio-01", last_seen_at: now, worker_status: "online", nas_connected: true }],
      worker_events: [{ id: "evt-1", folder_name: "0919_강남성형외과", status: "PENDING", created_at: now }],
      remote_jobs: [{ id: "job-1", action: "PHOTO_SORT", status: "RUNNING", created_at: now, completed_at: null }],
    });
    const response = await callStatusPanel();
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.worker).toMatchObject({ id: "jake-macstudio-01", online: true, worker_status: "online", nas_connected: true });
    expect(body.recentBackups).toEqual([{ id: "evt-1", folder_name: "0919_강남성형외과", status: "PENDING", created_at: now }]);
    expect(body.recentJobs).toEqual([{ id: "job-1", action: "PHOTO_SORT", status: "RUNNING", created_at: now, completed_at: null }]);
  });

  it("last_seen_at이 오래됐으면 online:false다(15초 창, isRemoteWorkerOnline 재사용)", async () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    currentDb = createFakeSupabase({
      remote_workers: [{ worker_id: "jake-macstudio-01", last_seen_at: old, worker_status: "online", nas_connected: true }],
      worker_events: [],
      remote_jobs: [],
    });
    const response = await callStatusPanel();
    const body = await response.json();
    expect(body.worker.online).toBe(false);
  });

  it("remote_workers에 row가 없으면 worker 필드 전부 null/id만 채운다(마이그레이션 전이거나 아직 하트비트 없음)", async () => {
    currentDb = createFakeSupabase({ remote_workers: [], worker_events: [], remote_jobs: [] });
    const response = await callStatusPanel();
    const body = await response.json();
    expect(body.worker).toEqual({ id: "jake-macstudio-01", online: null, worker_status: null, last_seen_at: null, nas_connected: null });
  });

  it("PING 액션은 recentJobs에서 제외된다", async () => {
    const now = new Date().toISOString();
    currentDb = createFakeSupabase({
      remote_workers: [],
      worker_events: [],
      remote_jobs: [
        { id: "job-ping", action: "PING", status: "COMPLETED", created_at: now, completed_at: now },
        { id: "job-sort", action: "PHOTO_SORT", status: "COMPLETED", created_at: now, completed_at: now },
      ],
    });
    const response = await callStatusPanel();
    const body = await response.json();
    // 이 fake table의 neq()는 실제 supabase처럼 서버에서 필터링된 상태를 흉내낸다.
    expect((body.recentJobs as Array<{ id: string }>).map((j) => j.id)).toEqual(["job-sort"]);
  });

  it("헤르메스 폴백이 없으면 hermesFallbackCount24h가 0이다", async () => {
    currentDb = createFakeSupabase({ remote_workers: [], worker_events: [], remote_jobs: [], olivia_chat_messages: [] });
    const response = await callStatusPanel();
    const body = await response.json();
    expect(body.hermesFallbackCount24h).toBe(0);
  });

  it("실제 fallbackReason이 있는 assistant 메시지만 hermesFallbackCount24h로 센다", async () => {
    currentDb = createFakeSupabase({
      remote_workers: [], worker_events: [], remote_jobs: [],
      olivia_chat_messages: [
        { id: "msg-1", role: "assistant", "metadata->>agentEngine": "legacy", "metadata->>fallbackReason": "connect timeout" },
        // 초기 Phase 4 배포에서 cloud로 잘못 저장된 과거 폴백도 집계해야 한다.
        { id: "msg-2", role: "assistant", "metadata->>agentEngine": "cloud", "metadata->>fallbackReason": "idle timeout" },
        { id: "msg-3", role: "assistant", "metadata->>agentEngine": "hermes", "metadata->>fallbackReason": null },
        { id: "msg-4", role: "user", "metadata->>agentEngine": "legacy", "metadata->>fallbackReason": "connect timeout" },
        { id: "msg-5", role: "assistant", "metadata->>agentEngine": "legacy", "metadata->>fallbackReason": null },
      ],
    });
    const response = await callStatusPanel();
    const body = await response.json();
    expect(body.hermesFallbackCount24h).toBe(2);
  });

  it("한 테이블 조회가 실패해도(부분 실패) 나머지 섹션은 정상 반환하고 200을 유지한다", async () => {
    const now = new Date().toISOString();
    currentDb = createFakeSupabase(
      {
        remote_workers: [{ worker_id: "jake-macstudio-01", last_seen_at: now, worker_status: "online", nas_connected: true }],
        worker_events: [{ id: "evt-1", folder_name: "0919_강남성형외과", status: "PENDING", created_at: now }],
        remote_jobs: [],
      },
      { remote_jobs: "relation \"remote_jobs\" does not exist" },
    );
    const response = await callStatusPanel();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.worker.online).toBe(true);
    expect(body.recentBackups).toHaveLength(1);
    expect(body.recentJobs).toEqual([]);
  });
});
