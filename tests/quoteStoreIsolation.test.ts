import { describe, expect, it } from "vitest";
import { createQuoteStore } from "@/lib/store/useQuoteStore";

describe("quote editor store ownership", () => {
  it("keeps independent and CRM quote sessions isolated", () => {
    const standalone = createQuoteStore();
    const crm = createQuoteStore();

    standalone.getState().setQuoteTitle("독립 견적 A");
    standalone.getState().setCustomer((customer) => ({ ...customer, hospitalName: "고객 A" }));
    crm.getState().setQuoteTitle("CRM 견적 B");
    crm.getState().setCustomer((customer) => ({ ...customer, hospitalName: "고객 B" }));

    expect(standalone.getState()).toMatchObject({ quoteTitle: "독립 견적 A", customer: { hospitalName: "고객 A" } });
    expect(crm.getState()).toMatchObject({ quoteTitle: "CRM 견적 B", customer: { hospitalName: "고객 B" } });

    crm.getState().clearDirty();
    expect(standalone.getState().dirtyFields.size).toBeGreaterThan(0);
    expect(crm.getState().dirtyFields.size).toBe(0);
  });
});
