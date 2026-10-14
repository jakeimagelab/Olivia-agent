import { describe, expect, it } from "vitest";
import {
  parsePortraitConsentSignatureLimit,
  resolvePortraitConsentLinkUpdate,
  resolvePortraitConsentStatus,
} from "@/lib/portraitConsent";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const RUN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("portrait consent customer/project links", () => {
  it("allows creating an unlinked consent", () => {
    expect(resolvePortraitConsentLinkUpdate({})).toEqual({
      clientId: null,
      workflowRunId: null,
      requested: false,
      error: null,
    });
  });

  it("allows selecting a customer without a project", () => {
    expect(resolvePortraitConsentLinkUpdate({ clientId: CLIENT_A })).toMatchObject({
      clientId: CLIENT_A,
      workflowRunId: null,
      error: null,
    });
  });

  it("clears the old project when the customer changes", () => {
    expect(resolvePortraitConsentLinkUpdate(
      { clientId: CLIENT_B },
      { clientId: CLIENT_A, workflowRunId: RUN_A },
    )).toMatchObject({ clientId: CLIENT_B, workflowRunId: null, error: null });
  });

  it("clears both values when the customer is unlinked", () => {
    expect(resolvePortraitConsentLinkUpdate(
      { clientId: null },
      { clientId: CLIENT_A, workflowRunId: RUN_A },
    )).toMatchObject({ clientId: null, workflowRunId: null, error: null });
  });

  it("rejects a project without a customer", () => {
    expect(resolvePortraitConsentLinkUpdate({ workflowRunId: RUN_A }).error).toBe(
      "촬영 건을 연결하려면 고객을 먼저 선택해 주세요.",
    );
  });
});

describe("portrait consent multi-signer rules", () => {
  it("accepts whole-number signature limits from 1 to 100", () => {
    expect(parsePortraitConsentSignatureLimit(2)).toEqual({ value: 2, error: null });
    expect(parsePortraitConsentSignatureLimit("100")).toEqual({ value: 100, error: null });
  });

  it("rejects missing-range and fractional signature limits", () => {
    expect(parsePortraitConsentSignatureLimit(0).error).toContain("1명에서 100명");
    expect(parsePortraitConsentSignatureLimit(2.5).error).toContain("1명에서 100명");
    expect(parsePortraitConsentSignatureLimit(101).error).toContain("1명에서 100명");
  });

  it("keeps a partially signed shared consent open and marks it complete at the limit", () => {
    expect(resolvePortraitConsentStatus(1, 2, true)).toBe("sent");
    expect(resolvePortraitConsentStatus(2, 2, true)).toBe("signed");
    expect(resolvePortraitConsentStatus(0, 2, false)).toBe("draft");
  });
});
