import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeWorkTool, WORK_TOOL_NAMES } from "@/lib/olivia/v2/toolExecutors/work";

const context = { recentActions: [], revision: 0 };
const originalFetch = global.fetch;

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

describe("work_journal_* tools (Phase 2 §3 — orphaned work_journal_tasks 노출)", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("6개 신규 이름 + 기존 3개 이름을 전부 유지한다(이원화 제거는 tool 폐기가 아니라 UI 추가로 처리)", () => {
    expect(WORK_TOOL_NAMES).toEqual(expect.arrayContaining([
      "work_list_today", "work_create", "work_complete",
      "work_journal_list", "work_journal_get", "work_journal_create", "work_journal_update",
      "work_journal_complete", "work_journal_search",
    ]));
  });

  it("work_journal_list는 date만 있으면 date 파라미터로 조회한다", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse({ ok: true, tasks: [{ id: "t1" }] });
    }) as unknown as typeof fetch;

    const result = await executeWorkTool("work_journal_list", { date: "2026-09-17" }, context);
    expect(result.success).toBe(true);
    expect(calls[0]).toContain("date=2026-09-17");
    expect(calls[0]).not.toContain("from=");
  });

  it("work_journal_list는 from/to가 있으면 기간 파라미터로 조회한다(어제 업무일지류)", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse({ ok: true, tasks: [] });
    }) as unknown as typeof fetch;

    await executeWorkTool("work_journal_list", { from: "2026-09-16", to: "2026-09-16" }, context);
    expect(calls[0]).toContain("from=2026-09-16");
    expect(calls[0]).toContain("to=2026-09-16");
  });

  it("work_journal_list는 date/from/to가 전부 없으면 명확히 실패한다(전체 테이블 무제한 조회 방지)", async () => {
    await expect(executeWorkTool("work_journal_list", {}, context)).rejects.toThrow();
  });

  it("work_journal_search는 q 파라미터로 검색한다", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse({ ok: true, tasks: [{ id: "t1", title: "견적서 작업" }] });
    }) as unknown as typeof fetch;

    const result = await executeWorkTool("work_journal_search", { query: "견적서" }, context);
    expect(result.success).toBe(true);
    expect(calls[0]).toContain("q=");
    expect(decodeURIComponent(calls[0])).toContain("견적서");
  });

  it("work_journal_get은 taskId로 단건 조회한다", async () => {
    global.fetch = vi.fn(async (url: string) => {
      expect(url).toContain("/api/work-journal/tasks/task-1");
      return jsonResponse({ ok: true, task: { id: "task-1", title: "확인" } });
    }) as unknown as typeof fetch;

    const result = await executeWorkTool("work_journal_get", { taskId: "task-1" }, context);
    expect(result).toMatchObject({ success: true, data: { taskId: "task-1" } });
  });

  it("work_journal_create는 work_create와 동일하게 생성 후 재조회로 검증한다", async () => {
    let call = 0;
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        expect(init?.method).toBe("POST");
        return jsonResponse({ ok: true, task: { id: "new-task" } });
      }
      return jsonResponse({ ok: true, task: { id: "new-task", title: "강재활의학과 수정본 확인", dueDate: "2026-09-17" } });
    }) as unknown as typeof fetch;

    const result = await executeWorkTool("work_journal_create", { date: "2026-09-17", title: "강재활의학과 수정본 확인" }, context);
    expect(result).toMatchObject({ success: true, data: { taskId: "new-task" }, verification: { persisted: true } });
  });

  it("work_journal_create는 저장된 값이 요청과 다르면 성공으로 보고하지 않는다", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ ok: true, task: { id: "new-task" } });
      return jsonResponse({ ok: true, task: { id: "new-task", title: "다른 제목", dueDate: "2026-09-17" } });
    }) as unknown as typeof fetch;

    await expect(executeWorkTool("work_journal_create", { date: "2026-09-17", title: "강재활의학과 수정본 확인" }, context))
      .rejects.toThrow();
  });

  it("work_journal_update는 변경 필드가 없으면 실패한다", async () => {
    await expect(executeWorkTool("work_journal_update", { taskId: "task-1" }, context)).rejects.toThrow();
  });

  it("work_journal_update는 PATCH 후 재조회 값이 요청과 일치해야 성공한다", async () => {
    let call = 0;
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      call += 1;
      if (call === 1) { expect(init?.method).toBe("PATCH"); return jsonResponse({ ok: true }); }
      return jsonResponse({ ok: true, task: { id: "task-1", status: "done" } });
    }) as unknown as typeof fetch;

    const result = await executeWorkTool("work_journal_update", { taskId: "task-1", status: "done" }, context);
    expect(result).toMatchObject({ success: true, verification: { persisted: true } });
  });

  it("work_journal_update는 재조회 값이 요청과 다르면 성공으로 보고하지 않는다", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return jsonResponse({ ok: true });
      return jsonResponse({ ok: true, task: { id: "task-1", status: "pending" } });
    }) as unknown as typeof fetch;

    await expect(executeWorkTool("work_journal_update", { taskId: "task-1", status: "done" }, context)).rejects.toThrow();
  });

  it("work_journal_complete는 work_complete와 동일하게 완료 처리 후 재조회로 검증한다", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return jsonResponse({ ok: true });
      return jsonResponse({ ok: true, task: { id: "task-1", status: "done" } });
    }) as unknown as typeof fetch;

    const result = await executeWorkTool("work_journal_complete", { taskId: "task-1" }, context);
    expect(result).toMatchObject({ success: true, verification: { persisted: true } });
  });
});
