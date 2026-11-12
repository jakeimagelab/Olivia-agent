import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { customerBridgeQualityControlMessage } from "@/components/select-gallery/useCustomerBridgeQuality";

describe("customer Bridge quality controller", () => {
  it("keeps stable Korean status messages for every worker action", () => {
    expect(customerBridgeQualityControlMessage("pause")).toBe("AI 검사를 일시정지했습니다.");
    expect(customerBridgeQualityControlMessage("resume")).toBe("AI 검사를 이어서 진행합니다.");
    expect(customerBridgeQualityControlMessage("retry")).toBe("실패한 사진만 다시 검사합니다.");
    expect(customerBridgeQualityControlMessage("cancel")).toBe("AI 검사를 취소했습니다.");
  });

  it("does not couple AI review state to customer ratings or color labels", () => {
    const source = readFileSync("components/select-gallery/useCustomerBridgeQuality.ts", "utf8");
    expect(source).not.toContain("setCustomerRatings");
    expect(source).not.toContain("setCustomerColorLabels");
    expect(source).not.toContain("selectionSync");
  });
});
