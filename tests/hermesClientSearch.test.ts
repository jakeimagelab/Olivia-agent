import { afterEach, describe, expect, it, vi } from "vitest";
import { searchOliviaClients } from "@/lib/olivia/clientSearch";
import { authorizeHermesToolRequest } from "@/lib/hermes/auth";

type Row = { id: string; hospital_name: string; specialty: string | null };

function fakeDb(rows: Row[], fail = false) {
  return {
    from: () => {
      let keyword: string | undefined;
      const builder = {
        select: () => builder,
        ilike: (_column: string, pattern: string) => {
          keyword = pattern.slice(1, -1);
          return builder;
        },
        limit: () => builder,
        then: (resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
          if (fail) return Promise.resolve(resolve({ data: null, error: { message: "db unavailable" } }));
          const data = keyword
            ? rows.filter((row) => row.hospital_name.toLowerCase().includes(keyword!.toLowerCase()))
            : rows;
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return builder;
    },
  };
}

describe("Hermes Olivia client.search", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("실제 고객명을 검색하고 verification을 반환한다", async () => {
    const result = await searchOliviaClients("강재활의학과", {
      db: fakeDb([{ id: "1", hospital_name: "강재활의학과", specialty: "재활의학과" }]) as never,
    });
    expect(result.clients).toEqual([{ id: "1", name: "강재활의학과", specialty: "재활의학과" }]);
    expect(result.verification).toMatchObject({ executed: true, resourceExists: true });
  });

  it("공백 차이가 있어도 fuzzy 후보를 반환한다", async () => {
    const result = await searchOliviaClients("강 재활", {
      db: fakeDb([{ id: "1", hospital_name: "강재활의학과", specialty: null }]) as never,
    });
    expect(result.clients.map((client) => client.name)).toEqual(["강재활의학과"]);
  });

  it("없는 고객은 성공한 0건 검색으로 검증한다", async () => {
    const result = await searchOliviaClients("존재하지않는병원123", { db: fakeDb([]) as never });
    expect(result.clients).toEqual([]);
    expect(result.verification).toMatchObject({ executed: true, resourceExists: false });
  });

  it("동일 검색어 후보를 임의로 하나로 줄이지 않는다", async () => {
    const result = await searchOliviaClients("강재활", {
      db: fakeDb([
        { id: "1", hospital_name: "강재활의학과 강남점", specialty: null },
        { id: "2", hospital_name: "강재활의학과 송파점", specialty: null },
      ]) as never,
    });
    expect(result.clients).toHaveLength(2);
  });

  it("DB 오류를 0건으로 가장하지 않는다", async () => {
    await expect(searchOliviaClients("강재활", { db: fakeDb([], true) as never }))
      .rejects.toThrow("검색 데이터 조회에 실패했습니다.");
  });

  it("MCP bridge는 shared secret bearer만 허용한다", () => {
    vi.stubEnv("HERMES_TOOL_SHARED_SECRET", "test-shared-secret");
    expect(authorizeHermesToolRequest(new Request("http://localhost", {
      headers: { Authorization: "Bearer test-shared-secret" },
    }))).toBe("ok");
    expect(authorizeHermesToolRequest(new Request("http://localhost", {
      headers: { Authorization: "Bearer wrong" },
    }))).toBe("unauthorized");
  });
});
