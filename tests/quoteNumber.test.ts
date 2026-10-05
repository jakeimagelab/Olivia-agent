import { describe, expect, it } from "vitest";
import { createQuoteNumber, nextQuoteNumber, quoteNumberPrefixForBrand } from "@/lib/quote/quoteNumber";

describe("quote number sequence", () => {
  const date = "20261006";

  it("starts each brand at 0002", () => {
    expect(createQuoteNumber("photoclinic", date)).toBe("PCQ-20261006-0002");
    expect(createQuoteNumber("jakeimage", date)).toBe("JKQ-20261006-0002");
  });

  it("uses only the current brand and day prefix when finding the next sequence", () => {
    const numbers = ["PC-20261006-099", "JI-20261006-099", "PCQ-20261006-0002", "PCQ-20261006-0005", "JKQ-20261006-0008"];
    expect(nextQuoteNumber("photoclinic", numbers, date)).toBe("PCQ-20261006-0006");
    expect(nextQuoteNumber("jakeimage", numbers, date)).toBe("JKQ-20261006-0009");
  });

  it("keeps the required public prefixes", () => {
    expect(quoteNumberPrefixForBrand("photoclinic")).toBe("PCQ-");
    expect(quoteNumberPrefixForBrand("jakeimage")).toBe("JKQ-");
  });
});
