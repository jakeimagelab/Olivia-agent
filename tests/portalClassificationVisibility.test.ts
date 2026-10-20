import { describe, expect, it } from "vitest";
import { getClassificationPortalAccess } from "@/lib/photo-storage/portalVisibility";

function databaseResult(data: unknown, error: unknown = null) {
  const chain: any = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data, error }),
  };
  return chain;
}

function clientScopedDatabase() {
  return {
    from(table: string) {
      const result = table === "workflow_runs"
        ? { data: { id: "run-latest" }, error: null }
        : { data: { id: "project-1", classify_approved_at: null }, error: null };
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  } as any;
}

describe("고객 포털 분류 승인 가드", () => {
  it("연결된 사진 프로젝트가 없던 옛 건은 그대로 보인다", async () => {
    await expect(getClassificationPortalAccess(databaseResult(null), "run-1")).resolves.toEqual({
      connected: false,
      approved: true,
      pending: false,
    });
  });

  it("분류 승인 시각이 비어 있으면 갤러리를 막는다", async () => {
    await expect(getClassificationPortalAccess(databaseResult({ id: "p1", classify_approved_at: null }), "run-1")).resolves.toEqual({
      connected: true,
      approved: false,
      pending: true,
    });
  });

  it("분류 승인 시각이 있으면 갤러리를 연다", async () => {
    await expect(getClassificationPortalAccess(databaseResult({ id: "p1", classify_approved_at: "2026-10-20T00:00:00Z" }), "run-1")).resolves.toEqual({
      connected: true,
      approved: true,
      pending: false,
    });
  });

  it("고객 단위 링크는 최신 워크플로우를 찾아 승인 여부를 확인한다", async () => {
    await expect(getClassificationPortalAccess(clientScopedDatabase(), null, "client-1")).resolves.toEqual({
      connected: true,
      approved: false,
      pending: true,
    });
  });
});
