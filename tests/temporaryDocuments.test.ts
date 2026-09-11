import { describe, expect, it } from "vitest";
import { registerTemporaryDocument, temporaryDocumentRoute } from "@/lib/olivia/documents/temporaryDocuments";

function fakeDb(options: { clients?: Array<{ id: string; hospital_name: string }>; workflowRunId?: string | null } = {}) {
  const writes: Array<{ table: string; kind: string; payload: Record<string, unknown> }> = [];
  const clients = options.clients ?? [];
  const db = {
    from(table: string) {
      if (table === "clients") {
        return { select() { return this; }, limit: async () => ({ data: clients, error: null }) };
      }
      if (table === "workflow_runs") {
        return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: options.workflowRunId ? { id: options.workflowRunId } : null, error: null }) };
      }
      if (table === "temporary_documents") {
        return {
          upsert(payload: Record<string, unknown>) {
            writes.push({ table, kind: "upsert", payload });
            return { select() { return this; }, single: async () => ({ data: { id: "temp-1", preview_url: null, created_at: "2026-09-11T00:00:00Z", ...payload }, error: null }) };
          },
        };
      }
      return {
        update(payload: Record<string, unknown>) {
          writes.push({ table, kind: "update", payload });
          return { eq() { return this; }, select() { return this; }, single: async () => ({ data: { id: "source-1", client_id: payload.client_id, hospital_id: payload.hospital_id, workflow_run_id: payload.workflow_run_id }, error: null }) };
        },
      };
    },
  };
  return { db: db as any, writes };
}

describe("temporary document inbox", () => {
  it("고객이 없으면 원본 참조를 pending_review로 등록한다", async () => {
    const { db, writes } = fakeDb();
    const result = await registerTemporaryDocument(db, {
      documentType: "quote", sourceTable: "quotes", sourceId: "source-1", title: "새봄병원 견적서", hospitalName: "새봄 병원",
    });
    expect(result.clientResolution).toBe("pending");
    expect(result.temporaryDocument).toMatchObject({ id: "temp-1", status: "pending_review", client_id: null });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: "temporary_documents", kind: "upsert", payload: { source_table: "quotes", source_id: "source-1", status: "pending_review" } });
  });

  it("공백 차이만 있는 기존 고객은 원본과 자동 연결한다", async () => {
    const { db, writes } = fakeDb({ clients: [{ id: "client-1", hospital_name: "새봄병원" }], workflowRunId: "run-1" });
    const result = await registerTemporaryDocument(db, {
      documentType: "quote", sourceTable: "quotes", sourceId: "source-1", title: "새봄병원 견적서", hospitalName: "새봄 병원",
    });
    expect(result.clientResolution).toBe("existing");
    expect(result.temporaryDocument).toMatchObject({ status: "linked", client_id: "client-1", workflow_run_id: "run-1" });
    expect(writes[0]).toMatchObject({ table: "quotes", kind: "update", payload: { client_id: "client-1", workflow_run_id: "run-1" } });
  });

  it("고객 ID가 없어도 원본 문서 화면으로 이동하는 링크를 만든다", () => {
    expect(temporaryDocumentRoute({ source_table: "quotes", source_id: "q1" })).toBe("/quote?id=q1");
    expect(temporaryDocumentRoute({ source_table: "contracts", source_id: "c1" })).toBe("/contract?resourceId=c1");
    expect(temporaryDocumentRoute({ source_table: "conti_runs", source_id: "r1" })).toBe("/conti?resourceId=r1");
  });
});
