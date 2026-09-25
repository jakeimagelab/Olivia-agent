import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSystemStatusChatRequest } from "@/lib/system-status/chatIntent";
import { formatSystemStatusForChat } from "@/lib/system-status/format";
import { readWorkerDiagnostics, workerDiagnosticsToRow } from "@/lib/system-status/workerDiagnostics";

vi.mock("@/lib/hermes/client", () => ({
  checkHermesHealth: vi.fn(async () => ({ online: true, httpStatus: 200, elapsedMs: 24 })),
  getOliviaAgentEngine: vi.fn(() => "hermes"),
}));

type FakeOptions = {
  now: string;
  mcpLastSeen?: string;
  missingTable?: string;
  workerLastSeen?: string;
};

function fakeSupabase(options: FakeOptions): SupabaseClient {
  return {
    from(table: string) {
      return {
        select(columns: string, selectOptions?: { count?: string; head?: boolean }) {
          const filters: Record<string, unknown> = {};
          const result = () => {
            if (columns === "*" && table === options.missingTable) {
              return { data: null, error: { code: "PGRST205", message: "missing" }, count: null };
            }
            if (columns === "*" && ["worker_events", "remote_workers", "remote_jobs", "photo_storage_projects"].includes(table)) {
              return { data: [], error: null, count: null };
            }
            if (table === "system_status_signals") {
              return { data: { last_seen_at: options.mcpLastSeen ?? options.now, tool_count: 21 }, error: null, count: null };
            }
            if (table === "remote_workers" && columns.includes("worker_status")) {
              return { data: { last_seen_at: options.workerLastSeen ?? options.now, worker_status: "idle", nas_connected: true }, error: null, count: null };
            }
            if (table === "remote_workers" && columns.includes("workstation_mounted")) {
              return {
                data: {
                  workstation_mounted: true,
                  workstation_accessible: true,
                  agentstation_mounted: true,
                  agentstation_accessible: true,
                  watcher_last_scan_at: options.now,
                },
                error: null,
                count: null,
              };
            }
            if (table === "remote_workers" && columns.includes("openai_api_key_configured")) {
              return { data: { openai_api_key_configured: true }, error: null, count: null };
            }
            if (table === "remote_jobs" && selectOptions?.head) {
              return { data: null, error: null, count: 0 };
            }
            return { data: [], error: null, count: null };
          };
          const builder = {
            eq(column: string, value: unknown) { filters[column] = value; return builder; },
            limit() { return builder; },
            maybeSingle: async () => result(),
            then<TResult1 = unknown, TResult2 = never>(
              onfulfilled?: ((value: ReturnType<typeof result>) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) {
              return Promise.resolve(result()).then(onfulfilled, onrejected);
            },
          };
          return builder;
        },
      };
    },
  } as unknown as SupabaseClient;
}

const ENV_NAMES = ["HERMES_BASE_URL", "HERMES_API_SECRET", "HERMES_TOOL_SHARED_SECRET", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;
const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

beforeEach(() => {
  process.env.HERMES_BASE_URL = "https://hermes.example.com";
  process.env.HERMES_API_SECRET = "hermes-api-super-secret";
  process.env.HERMES_TOOL_SHARED_SECRET = "mcp-super-secret";
  process.env.OPENAI_API_KEY = "openai-super-secret";
  process.env.ANTHROPIC_API_KEY = "anthropic-super-secret";
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("Olivia chat 시스템 진단", () => {
  it.each([
    "시스템 상태 확인해줘",
    "헤르메스 연결이 왜 안 돼?",
    "MCP 문제 보고해줘",
    "맥스튜디오 워커 진단해줘",
    "지금 뭐가 문제인지 보고해줘",
    "문제가 뭔지 보고해줘",
    "올리비아가 작동 안돼 원인 확인해줘",
  ])("'%s' 요청을 Hermes 이전의 직접 진단으로 판정한다", (message) => {
    expect(isSystemStatusChatRequest(message)).toBe(true);
  });

  it.each(["이 견적이 왜 안 돼?", "일정 삭제해줘", "오늘 상태 어때?"])("일반 업무 요청 '%s'은 시스템 진단으로 가로채지 않는다", (message) => {
    expect(isSystemStatusChatRequest(message)).toBe(false);
  });

  it("Worker 진단 헤더를 mount와 access로 분리한다", () => {
    const headers = new Headers({
      "x-olivia-workstation-mounted": "true",
      "x-olivia-workstation-accessible": "false",
      "x-olivia-agentstation-mounted": "false",
      "x-olivia-agentstation-accessible": "false",
      "x-olivia-photo-watcher-last-scan-at": "2026-09-19T01:02:03+09:00",
      "x-olivia-openai-api-key-configured": "false",
    });
    expect(workerDiagnosticsToRow(readWorkerDiagnostics(headers))).toEqual({
      workstation_mounted: true,
      workstation_accessible: false,
      agentstation_mounted: false,
      agentstation_accessible: false,
      watcher_last_scan_at: "2026-09-18T16:02:03.000Z",
      openai_api_key_configured: false,
    });
  });

  it("Worker의 OPENAI_API_KEY 누락을 작업 전에 오류로 표시한다", async () => {
    const now = new Date("2026-09-19T12:00:00+09:00");
    const db = fakeSupabase({ now: now.toISOString() });
    const originalFrom = db.from.bind(db);
    db.from = ((table: string) => {
      const builder = originalFrom(table);
      if (table !== "remote_workers") return builder;
      const originalSelect = builder.select.bind(builder);
      builder.select = ((columns: string, options?: { count?: string; head?: boolean }) => {
        if (!columns.includes("openai_api_key_configured")) return originalSelect(columns, options);
        const query = {
          eq() { return query; },
          maybeSingle: async () => ({ data: { openai_api_key_configured: false }, error: null }),
        };
        return query as never;
      }) as typeof builder.select;
      return builder;
    }) as typeof db.from;
    const { collectSystemStatus } = await import("@/lib/system-status/service");
    const report = await collectSystemStatus({ now, db });
    expect(report.items.find((item) => item.id === "worker_openai_key")).toMatchObject({
      level: "error",
      state: "OPENAI_API_KEY 없음",
    });
  });

  it("모든 연결이 정상이면 정상 보고를 만들고 secret/URL 값은 포함하지 않는다", async () => {
    const now = new Date("2026-09-19T12:00:00+09:00");
    const { collectSystemStatus } = await import("@/lib/system-status/service");
    const report = await collectSystemStatus({ now, db: fakeSupabase({ now: now.toISOString() }) });
    expect(report.issueCount).toBe(0);
    expect(report.items.find((item) => item.id === "mcp_tools")).toMatchObject({ level: "ok", state: "연결됨" });
    const serialized = JSON.stringify(report);
    for (const secret of ["hermes-api-super-secret", "mcp-super-secret", "openai-super-secret", "anthropic-super-secret", "https://hermes.example.com"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("Hermes가 ONLINE이어도 ListTools가 24시간 넘게 없으면 MCP만 미연결로 보고한다", async () => {
    const now = new Date("2026-09-19T12:00:00+09:00");
    const stale = new Date(now.getTime() - 25 * 60 * 60 * 1_000).toISOString();
    const { collectSystemStatus } = await import("@/lib/system-status/service");
    const report = await collectSystemStatus({ now, db: fakeSupabase({ now: now.toISOString(), mcpLastSeen: stale }) });
    expect(report.items.find((item) => item.id === "hermes_health")).toMatchObject({ level: "ok", state: "ONLINE" });
    expect(report.items.find((item) => item.id === "mcp_tools")).toMatchObject({ level: "error", state: "미연결" });
  });

  it("한 필수 테이블이 없더라도 나머지 진단 결과를 유지하고 문제를 먼저 출력한다", async () => {
    const now = new Date("2026-09-19T12:00:00+09:00");
    const { collectSystemStatus } = await import("@/lib/system-status/service");
    const report = await collectSystemStatus({ now, db: fakeSupabase({ now: now.toISOString(), missingTable: "worker_events" }) });
    expect(report.items.find((item) => item.id === "table_worker_events")).toMatchObject({ level: "error", state: "없음" });
    expect(report.items.find((item) => item.id === "table_remote_jobs")).toMatchObject({ level: "ok", state: "OK" });
    const text = formatSystemStatusForChat(report);
    expect(text).toContain("조치:");
    expect(text.indexOf("worker_events · 없음")).toBeLessThan(text.indexOf("remote_jobs · OK"));
  });
});
