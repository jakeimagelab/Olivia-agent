import { beforeEach, describe, expect, it, vi } from "vitest";

const matchClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/clientMatching", () => ({ matchClient }));

import { resolveQuoteWorkflowLink } from "@/lib/quote/quoteWorkflowLink";

describe("resolveQuoteWorkflowLink", () => {
  beforeEach(() => {
    matchClient.mockReset();
  });

  it("미연결 견적서가 고객을 자동 생성하지 않고 명시적 고객등록을 요구한다", async () => {
    matchClient.mockResolvedValueOnce({ status: "no_match" });

    const result = await resolveQuoteWorkflowLink(
      {} as never,
      { id: "quote-1", hospital_name: "1989 삼칠갈비", client_id: null },
      {},
    );

    expect(result).toEqual({ status: "needs_registration", hospitalName: "1989 삼칠갈비" });
    expect(matchClient).toHaveBeenCalledOnce();
  });
});
