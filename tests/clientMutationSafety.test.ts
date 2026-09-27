import { beforeEach, describe, expect, it, vi } from "vitest";

type ClientRow = { id: string; hospital_name: string; archived_at: string | null };
type WorkflowRow = { id: string; client_id: string; status: string };

const state = vi.hoisted(() => ({
  clients: [] as ClientRow[],
  workflows: [] as WorkflowRow[],
  persistArchive: true,
}));

const callOliviaApiMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      let equals: Record<string, unknown> = {};
      let ilike: { column: string; value: string } | undefined;
      let nullColumn: string | undefined;
      let updatePayload: Record<string, unknown> | undefined;

      const rows = () => {
        const source = table === "clients" ? state.clients : table === "workflow_runs" ? state.workflows : [];
        return source.filter((row) => {
          for (const [column, value] of Object.entries(equals)) {
            if ((row as unknown as Record<string, unknown>)[column] !== value) return false;
          }
          if (ilike) {
            const query = ilike.value.replaceAll("%", "").toLowerCase();
            if (!String((row as unknown as Record<string, unknown>)[ilike.column] ?? "").toLowerCase().includes(query)) return false;
          }
          if (nullColumn && (row as unknown as Record<string, unknown>)[nullColumn] != null) return false;
          return true;
        });
      };

      const applyUpdate = () => {
        const matched = rows();
        if (updatePayload && state.persistArchive) {
          for (const row of matched) Object.assign(row, updatePayload);
        }
        return matched;
      };

      const query: Record<string, any> = {};
      query.select = () => query;
      query.eq = (column: string, value: unknown) => {
        equals = { ...equals, [column]: value };
        return query;
      };
      query.ilike = (column: string, value: string) => {
        ilike = { column, value };
        return query;
      };
      query.is = (column: string, value: unknown) => {
        if (value === null) nullColumn = column;
        return query;
      };
      query.update = (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return query;
      };
      query.limit = async (limit: number) => ({ data: applyUpdate().slice(0, limit), error: null });
      query.maybeSingle = async () => ({ data: applyUpdate()[0] ?? null, error: null });
      query.then = (resolve: (value: { data: unknown; error: null }) => unknown) => Promise.resolve(resolve({ data: applyUpdate(), error: null }));
      return query;
    },
  }),
}));

vi.mock("@/lib/olivia/v2/toolExecutors/http", () => ({
  callOliviaApi: (...args: unknown[]) => callOliviaApiMock(...args),
  internalFetcher: vi.fn(),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const baseContext: OliviaContextSnapshot = { recentActions: [], revision: 0 };

function execute(name: string, input: Record<string, unknown>, context: OliviaContextSnapshot = baseContext) {
  return executeAgentTool({ id: `${name}-call`, name, arguments: JSON.stringify(input) }, context);
}

describe("client mutation safety", () => {
  beforeEach(() => {
    state.clients = [{ id: "client-main", hospital_name: "여의도기통찬의원", archived_at: null }];
    state.workflows = [{ id: "workflow-main", client_id: "client-main", status: "active" }];
    state.persistArchive = true;
    callOliviaApiMock.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/clients" && init?.method === "POST") {
        const body = JSON.parse(String(init.body || "{}"));
        const created = { id: "client-new", hospital_name: body.name, archived_at: null };
        state.clients.push(created);
        return { ok: true, id: created.id, workflowRunId: "workflow-new", created: true };
      }
      if (path === "/api/clients/client-new" && !init?.method) {
        return { ok: true, client: state.clients.find((client) => client.id === "client-new") };
      }
      throw new Error(`unexpected API call: ${init?.method || "GET"} ${path}`);
    });
  });

  it.each(["client_create", "apply_client_create", "client_update"])("실제 사고 문장에서 %s를 실행 직전에 차단한다", async (toolName) => {
    const execution = await execute(toolName, {
      hospitalName: "여의도기통찬의원", contactName: null, phone: null, email: null, specialty: null, memo: null,
    }, { ...baseContext, currentRequestText: "여의도기통찬의원 고객등록에서 삭제해줘" });

    expect(execution.result).toMatchObject({
      success: false,
      code: "MUTATION_INTENT_CONFLICT",
      verification: { executed: false },
    });
    expect(callOliviaApiMock).not.toHaveBeenCalled();
    expect(state.clients).toHaveLength(1);
  });

  it("client_archive는 변경하지 않고 정확한 대상의 보관 승인만 만든다", async () => {
    const execution = await execute("client_archive", { hospitalName: "여의도기통찬의원", clientId: null }, {
      ...baseContext,
      activeClientId: "other-client",
      activeClientName: "다른의원",
      currentRequestText: "여의도기통찬의원 삭제해줘",
    });

    expect(execution.result).toMatchObject({
      success: true,
      data: {
        approvalRequired: true,
        targetClientId: "client-main",
        hospitalName: "여의도기통찬의원",
      },
      verification: { executed: true, persisted: false, resourceExists: true },
    });
    expect(execution.uiActions).toEqual([expect.objectContaining({
      type: "REQUEST_APPROVAL",
      confirmLabel: "목록에서 숨기기",
      toolName: "apply_client_archive",
      toolInput: { clientId: "client-main", expectedHospitalName: "여의도기통찬의원" },
    })]);
    expect(state.clients[0].archived_at).toBeNull();
    expect(state.workflows[0].status).toBe("active");
  });

  it("승인 후 고객만 보관하고 연결된 워크플로는 그대로 둔다", async () => {
    const execution = await execute("apply_client_archive", {
      clientId: "client-main",
      expectedHospitalName: "여의도기통찬의원",
    }, { ...baseContext, currentRequestText: "삭제" });

    expect(execution.result).toMatchObject({
      success: true,
      data: { clientId: "client-main", hospitalName: "여의도기통찬의원" },
      verification: { executed: true, persisted: true, resourceExists: true, details: { archived: true } },
    });
    expect(state.clients[0].archived_at).toEqual(expect.any(String));
    expect(state.workflows[0].status).toBe("active");
    expect(callOliviaApiMock).not.toHaveBeenCalled();
  });

  it("명시한 이름이 여러 고객에 부분 일치하면 AMBIGUOUS로 끝낸다", async () => {
    state.clients = [
      { id: "client-main", hospital_name: "여의도기통찬의원", archived_at: null },
      { id: "client-branch", hospital_name: "여의도기통찬의원 강남점", archived_at: null },
    ];

    const execution = await execute("client_archive", { hospitalName: "기통찬", clientId: null }, {
      ...baseContext,
      currentRequestText: "기통찬 고객 삭제해줘",
    });

    expect(execution.result).toMatchObject({ success: false, code: "AMBIGUOUS", verification: { executed: false } });
    expect(state.clients.every((client) => client.archived_at === null)).toBe(true);
  });

  it("승인 후 실제 고객명이 바뀌면 TARGET_CHANGED로 중단한다", async () => {
    const execution = await execute("apply_client_archive", {
      clientId: "client-main",
      expectedHospitalName: "예전병원명",
    }, { ...baseContext, currentRequestText: "삭제" });

    expect(execution.result).toMatchObject({ success: false, code: "TARGET_CHANGED", verification: { executed: false } });
    expect(state.clients[0].archived_at).toBeNull();
  });

  it("보관 쓰기 뒤 상태가 남지 않으면 VERIFICATION_FAILED로 끝낸다", async () => {
    state.persistArchive = false;
    const execution = await execute("apply_client_archive", {
      clientId: "client-main",
      expectedHospitalName: "여의도기통찬의원",
    }, { ...baseContext, currentRequestText: "삭제" });

    expect(execution.result).toMatchObject({ success: false, code: "VERIFICATION_FAILED" });
    expect(state.clients[0].archived_at).toBeNull();
  });

  it("완전 삭제 요청은 보관 도구도 실행하지 않고 화면 삭제를 안내한다", async () => {
    const execution = await execute("client_archive", { hospitalName: "여의도기통찬의원", clientId: null }, {
      ...baseContext,
      currentRequestText: "여의도기통찬의원을 완전히 삭제해줘",
    });

    expect(execution.result).toMatchObject({ success: false, code: "MUTATION_INTENT_CONFLICT", verification: { executed: false } });
    expect(execution.result.error).toContain("고객관리 화면");
    expect(state.clients[0].archived_at).toBeNull();
  });

  it("client_create는 승인만 만들고 승인 후 내부 도구가 기존 생성 API를 호출한다", async () => {
    const input = { hospitalName: "새봄의원", contactName: null, phone: null, email: null, specialty: null, memo: null };
    const requested = await execute("client_create", input, {
      ...baseContext,
      currentRequestText: "새봄의원 신규 고객으로 등록해줘",
    });

    expect(requested.result).toMatchObject({ success: true, data: { approvalRequired: true, hospitalName: "새봄의원" }, verification: { persisted: false } });
    expect(requested.uiActions).toEqual([expect.objectContaining({
      type: "REQUEST_APPROVAL",
      confirmLabel: "등록",
      toolName: "apply_client_create",
    })]);
    expect(callOliviaApiMock).not.toHaveBeenCalled();

    const applied = await execute("apply_client_create", input, { ...baseContext, currentRequestText: "등록" });
    expect(callOliviaApiMock).toHaveBeenCalledWith("/api/clients", expect.objectContaining({ method: "POST" }));
    expect(applied.result).toMatchObject({ success: true, data: { clientId: "client-new", created: true }, verification: { persisted: true } });
  });
});
