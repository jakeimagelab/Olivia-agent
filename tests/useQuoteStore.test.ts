import { describe, expect, it } from "vitest";
import { useQuoteStore } from "@/lib/store/useQuoteStore";

// QuoteBuilder.tsx가 useState에서 이 store로 옮겨간 뒤에도 호출부(핸들러 본문)를 하나도 안
// 고쳤다 — 그게 가능하려면 각 setter가 useState의 두 가지 호출 형태(값 직접 전달 / (prev) =>
// next 함수형 업데이터)를 똑같이 지원해야 한다. QuoteBuilder.tsx에서 실제로 두 형태 다
// 쓰이는 필드(customer, quoteTitle, customItems 등)를 대표로 검증한다.
describe("useQuoteStore", () => {
  it("초기 상태가 QuoteFormState의 모든 필드를 갖는다", () => {
    const state = useQuoteStore.getState();
    for (const key of [
      "customer", "brand", "quoteTitle", "selectedPackageId", "selectedSingleItemIds",
      "singleItemAmounts", "profileCount", "stagedCount", "combinedProfileStagedCount",
      "floorCount", "largeHospital", "droneCount", "customItems", "benefitItems",
      "discountRate", "extraDiscount", "memo", "depositRate",
    ]) {
      expect(state).toHaveProperty(key);
    }
  });

  it("값을 직접 전달하는 형태를 지원한다", () => {
    useQuoteStore.getState().setQuoteTitle("TEST QUOTE");
    expect(useQuoteStore.getState().quoteTitle).toBe("TEST QUOTE");

    useQuoteStore.getState().setDiscountRate(10);
    expect(useQuoteStore.getState().discountRate).toBe(10);
  });

  it("함수형 업데이터 (prev) => next 형태를 지원한다", () => {
    useQuoteStore.getState().setCustomer({
      hospitalName: "A병원", managerName: "", phone: "", email: "",
      quoteDate: "", validUntil: "", shootDate: "", quoteNumber: "PC-001",
    });
    useQuoteStore.getState().setCustomer((prev) => ({ ...prev, hospitalName: "B병원" }));
    expect(useQuoteStore.getState().customer.hospitalName).toBe("B병원");
    expect(useQuoteStore.getState().customer.quoteNumber).toBe("PC-001");

    useQuoteStore.getState().setCustomItems([]);
    useQuoteStore.getState().setCustomItems((items) => [
      ...items,
      { id: "1", name: "영상촬영", detail: "", amount: 500000 },
    ]);
    expect(useQuoteStore.getState().customItems).toHaveLength(1);
    expect(useQuoteStore.getState().customItems[0].amount).toBe(500000);
  });

  it("배열/객체 필드를 직접 교체하는 형태도 지원한다(불러오기 시나리오)", () => {
    useQuoteStore.getState().setBenefitItems([{ id: "b1", name: "액자 서비스" }]);
    expect(useQuoteStore.getState().benefitItems).toEqual([{ id: "b1", name: "액자 서비스" }]);

    useQuoteStore.getState().setSingleItemAmounts({ "studio-profile": 300000 });
    expect(useQuoteStore.getState().singleItemAmounts).toEqual({ "studio-profile": 300000 });
  });
});
