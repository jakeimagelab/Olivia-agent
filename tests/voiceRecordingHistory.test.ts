import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

let rows: Row[] = [];
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "voice_recordings") throw new Error(`unexpected table: ${table}`);
      const builder: any = {
        select: () => builder,
        order: () => { builder._rows = [...rows].sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at))); return builder; },
        limit: (n: number) => { builder._rows = (builder._rows ?? rows).slice(0, n); return builder; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: builder._rows ?? rows, error: null })),
      };
      return builder;
    },
  }),
}));

// docs/tablet-ipad-home-memo-voice-spec.md §6-7 — 지난 녹음을 다시 찾아볼 방법이 없던 문제의
// 최우선 해결책: GET 목록 조회.
describe("GET /api/voice/sessions — 음성 기록 목록", () => {
  it("최신순으로 정렬해서 반환한다", async () => {
    rows = [
      { id: "a", title: "첫 미팅", status: "completed", duration_seconds: 120, summary: null, recorded_at: "2026-09-20T00:00:00Z", processed_at: null },
      { id: "b", title: "두번째 미팅", status: "completed", duration_seconds: 90, summary: null, recorded_at: "2026-09-22T00:00:00Z", processed_at: null },
    ];
    const { GET } = await import("@/app/api/voice/sessions/route");
    const response = await GET(new NextRequest("http://localhost/api/voice/sessions"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.recordings.map((r: Row) => r.id)).toEqual(["b", "a"]);
  });

  it("limit 파라미터를 반영하고 100을 넘지 않는다", async () => {
    rows = Array.from({ length: 10 }, (_, i) => ({
      id: `id-${i}`, title: `기록 ${i}`, status: "completed", duration_seconds: 60, summary: null,
      recorded_at: new Date(2026, 8, i + 1).toISOString(), processed_at: null,
    }));
    const { GET } = await import("@/app/api/voice/sessions/route");
    const response = await GET(new NextRequest("http://localhost/api/voice/sessions?limit=3"));
    const body = await response.json();
    expect(body.recordings).toHaveLength(3);
  });

  it("기록이 없으면 빈 배열을 반환한다", async () => {
    rows = [];
    const { GET } = await import("@/app/api/voice/sessions/route");
    const response = await GET(new NextRequest("http://localhost/api/voice/sessions"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.recordings).toEqual([]);
  });
});
