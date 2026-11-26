import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareQuoteCreateApproval } from "@/lib/olivia/v2/toolExecutors/quote";
import { readQuoteRequestWithAI } from "@/lib/quote/aiQuoteReader";

const SIMPLE = "테스트안과 브랜드 촬영 견적서\n의료진프로필\n연출(진료/수술)\n서비스항목\n15초 영상(인테리어, 단체연출)\n총 금액 300만원, 부가세 별도\n선금/잔금 50/50";
const COMPLEX = `${SIMPLE}\n촬영일은 첫 수술 상담 일정이 끝나는 날로 정할 예정이에요`;
const READING = {
  clientName: "테스트안과", titleTopic: "브랜드 촬영", isEvent: false, contactName: null,
  phone: null, email: null, blankContact: true, shootDate: null,
  items: [
    { name: "의료진프로필", details: [], amount: null, quantity: 1, free: false },
    { name: "연출(진료/수술)", details: [], amount: null, quantity: 1, free: false },
    { name: "15초 영상(인테리어, 단체연출)", details: [], amount: 0, quantity: 1, free: true },
  ],
  fixedTotal: null, itemPricesHidden: false, vatIncluded: true, depositRate: null,
  discount: null, roundDownUnit: null, brandExplicit: null, unreadLines: [], uncertain: [],
};

describe("Hermes quote reader", () => {
  const request = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("HERMES_BASE_URL", "https://hermes.example.test/");
    vi.stubEnv("HERMES_API_SECRET", "test-hermes-secret");
    request.mockReset();
    vi.stubGlobal("fetch", request);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("총액·항목이 명확하면 외부 호출 없이 같은 검산과 확인 화면을 제공한다", async () => {
    const prepared = await prepareQuoteCreateApproval({ requestText: SIMPLE, db: {} as never });
    expect(request).not.toHaveBeenCalled();
    expect(prepared.parsed).toMatchObject({ clientName: "테스트안과", fixedTotal: 3_000_000, taxMode: "separate", depositRate: 50, itemPricesHidden: true });
    expect(prepared.parsed.items[2]).toMatchObject({ name: "15초 영상(인테리어, 단체연출)", free: true, amount: 0 });
    expect(prepared.preview).toContain("공급가 3,000,000원 + 부가세 300,000원 = 합계 3,300,000원");
    expect(prepared.fallbackNotice).toBeNull();
  });

  it("복잡한 요청은 읽기 전용 Hermes로 보내고 원문의 금액 조건으로 검산한다", async () => {
    request.mockResolvedValue(Response.json({ content: JSON.stringify(READING), model: "gpt-6-astra" }));
    const prepared = await prepareQuoteCreateApproval({ requestText: COMPLEX, db: {} as never });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("https://hermes.example.test/olivia/quote-reader", expect.objectContaining({
      method: "POST", headers: { Authorization: "Bearer test-hermes-secret", "Content-Type": "application/json" }, redirect: "error",
    }));
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string);
    expect(body.text).toBe(COMPLEX);
    expect(body.instructions).toContain("JSON 객체 하나");
    expect(prepared.parsed).toMatchObject({ fixedTotal: 3_000_000, taxMode: "separate", depositRate: 50 });
    expect(prepared.preview).toContain("합계 3,300,000원");
  });

  it("Hermes 연결 실패에서도 원문 총액을 보존한다", async () => {
    request.mockRejectedValue(new Error("network unavailable"));
    const prepared = await prepareQuoteCreateApproval({ requestText: COMPLEX, db: {} as never });
    expect(prepared.fallbackNotice).toContain("기본 규칙으로 읽었어요");
    expect(prepared.preview).toContain("합계 3,300,000원");
  });

  it("시간 초과·HTTP 오류·형식이 잘못된 응답을 구분한다", async () => {
    const call = () => readQuoteRequestWithAI({ text: COMPLEX, today: "2026-11-26" });
    request.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    await expect(call()).rejects.toMatchObject({ code: "TIMEOUT" });
    request.mockResolvedValueOnce(Response.json({}, { status: 429 }));
    await expect(call()).rejects.toMatchObject({ code: "API_ERROR(429)", status: 429 });
    request.mockResolvedValueOnce(Response.json({ content: '{"items":[]}' }));
    await expect(call()).rejects.toMatchObject({ code: "SCHEMA_ERROR" });
  });
});
