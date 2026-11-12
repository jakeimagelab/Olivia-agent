import { describe, expect, it } from "vitest";
import { customerBridgeDownloadProgress } from "@/components/select-gallery/useCustomerBridgeDownload";

describe("customer Bridge download progress", () => {
  it("formats worker progress using photo counts", () => {
    expect(customerBridgeDownloadProgress(50, 52)).toBe("50 / 52장 준비");
    expect(customerBridgeDownloadProgress(1200, 1645)).toBe("1,200 / 1,645장 준비");
  });

  it("uses safe zero values for missing worker counters", () => {
    expect(customerBridgeDownloadProgress(undefined, null)).toBe("0 / 0장 준비");
  });
});
