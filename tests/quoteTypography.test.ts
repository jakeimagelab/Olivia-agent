import { describe, expect, it } from "vitest";
import { getQuoteRailNameSize } from "@/lib/quote/quoteTypography";

describe("getQuoteRailNameSize", () => {
  it("keeps short customer names at the default size", () => {
    expect(getQuoteRailNameSize("테스트 병원")).toBe("default");
  });

  it("uses the compact size for medium Korean hospital names", () => {
    expect(getQuoteRailNameSize("연세라이프구강내과")).toBe("compact");
  });

  it("uses the tight size for long Korean hospital names", () => {
    expect(getQuoteRailNameSize("연세라이프구강내과치과의원")).toBe("tight");
  });

  it("counts Latin characters by their narrower visual width", () => {
    expect(getQuoteRailNameSize("PHOTO CLINIC")).toBe("default");
  });
});
