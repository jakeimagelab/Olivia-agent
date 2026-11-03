import { describe, expect, it } from "vitest";
import {
  beginExistingQuoteLoad,
  canApplyClientPrefill,
  completeExistingQuoteLoad,
  createNewQuoteSession,
  failExistingQuoteLoad,
  isSameQuoteSession,
  quoteSaveIdentity,
} from "@/lib/quote/quoteEditorSession";
import { quoteFormSnapshot } from "@/lib/store/useQuoteStore";

const quote = (id: string, clientId: string | null, workflowRunId: string | null) => ({
  id,
  clientId,
  workflowRunId,
  quoteNumber: `PCQ-${id}`,
  updatedAt: `2026-11-03T00:0${id === "a" ? 1 : 2}:00.000Z`,
});

describe("quote editor session", () => {
  it("이전 고객 프리필이 진행 중이어도 기존 B 견적을 열기 시작하면 적용 권한을 잃는다", () => {
    const customerA = createNewQuoteSession({ clientId: "client-a", workflowRunId: "run-a" });
    const customerARequestToken = customerA.requestToken;
    const loadingB = beginExistingQuoteLoad(customerA, "b");

    expect(canApplyClientPrefill(loadingB, customerARequestToken)).toBe(false);
    const readyB = completeExistingQuoteLoad(loadingB, loadingB.requestToken, quote("b", "client-b", "run-b"));
    expect(readyB).toMatchObject({
      mode: "existing", quoteId: "b", clientId: "client-b", workflowRunId: "run-b", loadState: "ready",
    });
  });

  it("A 문서 응답이 늦게 도착해도 현재 B 세션에 적용하지 않는다", () => {
    const fresh = createNewQuoteSession();
    const loadingA = beginExistingQuoteLoad(fresh, "a");
    const loadingB = beginExistingQuoteLoad(loadingA, "b");

    expect(completeExistingQuoteLoad(loadingB, loadingA.requestToken, quote("a", "client-a", "run-a"))).toBeNull();
    expect(failExistingQuoteLoad(loadingB, loadingA.requestToken, "a")).toBeNull();
    expect(completeExistingQuoteLoad(loadingB, loadingB.requestToken, quote("b", "client-b", "run-b")))
      .toMatchObject({ quoteId: "b", clientId: "client-b", workflowRunId: "run-b" });
  });

  it("기존 문서 저장 payload는 실제 UUID·고객·촬영 건·updated_at을 한 묶음으로 사용한다", () => {
    const loading = beginExistingQuoteLoad(createNewQuoteSession(), "b");
    const ready = completeExistingQuoteLoad(loading, loading.requestToken, quote("b", "client-b", "run-b"));
    expect(ready).not.toBeNull();
    expect(quoteSaveIdentity(ready!)).toEqual({
      quoteId: "b",
      clientId: "client-b",
      workflowRunId: "run-b",
      lastKnownUpdatedAt: "2026-11-03T00:02:00.000Z",
    });
  });

  it("B 저장 중 C로 이동하면 B 응답은 C 세션의 상태를 바꿀 수 없다", () => {
    const loadingB = beginExistingQuoteLoad(createNewQuoteSession(), "b");
    const readyB = completeExistingQuoteLoad(loadingB, loadingB.requestToken, quote("b", "client-b", "run-b"))!;
    const loadingC = beginExistingQuoteLoad(readyB, "c");
    expect(isSameQuoteSession(loadingC, readyB)).toBe(false);
  });

  it("고객과 촬영 건이 없는 기존 견적도 null 소유 관계를 유지한다", () => {
    const loading = beginExistingQuoteLoad(createNewQuoteSession({ clientId: "client-a" }), "b");
    const ready = completeExistingQuoteLoad(loading, loading.requestToken, quote("b", null, null));
    expect(ready).toMatchObject({ clientId: null, workflowRunId: null });
  });

  it("문서 로드 기준선과 현재 폼은 객체 키 순서가 달라도 같은 스냅샷이다", () => {
    const customer = { hospitalName: "B병원", managerName: "B담당", phone: "02-0000-0000", email: "", quoteDate: "2026-11-03", validUntil: "2026-11-17", shootDate: "", quoteNumber: "PCQ-B" };
    const loaded = { customer, brand: "photoclinic" as const, quoteTitle: "B 견적" };
    const current = { quoteTitle: "B 견적", customer, brand: "photoclinic" as const };

    expect(quoteFormSnapshot(loaded)).toBe(quoteFormSnapshot(current));
  });
});
