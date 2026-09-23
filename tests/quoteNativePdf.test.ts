import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { quoteDocumentDataFromRow } from "@/lib/quote/quoteDocumentData";
import { createQuotePrintToken, verifyQuotePrintToken } from "@/lib/quote/quotePrintAuth";

describe("canonical quote document data", () => {
  it("uses one row converter for the saved quote rendered by mobile and print", () => {
    const data = quoteDocumentDataFromRow({
      id: "quote-1",
      title: "레이저 촬영 견적",
      hospital_name: "정렬피부과",
      contact_name: "김담당",
      phone: "010-0000-0000",
      email: "hello@example.com",
      quote_number: "PC-20260922-001",
      quote_date: "2026-09-22",
      valid_until: "2026-10-06",
      items: [
        { id: "shoot", name: "레이저 촬영", detail: "원장 시술", subtotal: 1_000_000 },
        { id: "benefit", name: "후속 편집", subtotal: 0 },
      ],
      discount_amount: 0,
      memos: "메모",
      form_state: { brand: "jakeimage", agentOverrideItems: true, depositRate: 40 },
    });

    expect(data).toMatchObject({
      brand: "jakeimage",
      quoteTitle: "레이저 촬영 견적",
      customer: { hospitalName: "정렬피부과", managerName: "김담당", quoteNumber: "PC-20260922-001" },
      customItems: [{ id: "shoot", name: "레이저 촬영", detail: "원장 시술", amount: 1_000_000 }],
      benefitItems: [{ id: "benefit", name: "후속 편집" }],
      depositRate: 40,
      finalAmount: 1_100_000,
    });
  });
});

describe("quote print route authentication", () => {
  const originalSecret = process.env.QUOTE_PRINT_SECRET;

  beforeEach(() => {
    process.env.QUOTE_PRINT_SECRET = "test-only-quote-print-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.QUOTE_PRINT_SECRET;
    else process.env.QUOTE_PRINT_SECRET = originalSecret;
  });

  it("accepts only the token signed for the requested quote", () => {
    const token = createQuotePrintToken("quote-1");
    expect(verifyQuotePrintToken("quote-1", token)).toBe(true);
    expect(verifyQuotePrintToken("quote-2", token)).toBe(false);
    expect(verifyQuotePrintToken("quote-1", null)).toBe(false);
  });
});

describe("native quote PDF source policy", () => {
  it("renders the canonical print route with native Chromium PDF options", () => {
    const renderer = readFileSync("lib/quote/renderQuotePdf.ts", "utf8");
    expect(renderer).toContain("/quote-print/");
    expect(renderer).toContain("page.goto(");
    expect(renderer).toContain("document.fonts.ready");
    expect(renderer).toContain('data-quote-print-ready="true"');
    expect(renderer).toContain('format: "A4"');
    expect(renderer).toContain("landscape: true");
    expect(renderer).toContain("preferCSSPageSize: true");
    expect(renderer).not.toContain("page.setContent(");
    expect(renderer).not.toContain("buildQuoteHtml");
  });

  it("does not rasterize the Desktop quote with html2canvas/jsPDF", () => {
    const builder = readFileSync("components/quote/QuoteBuilder.tsx", "utf8");
    expect(builder).toContain("/render`");
    expect(builder).not.toContain('import("html2canvas")');
    expect(builder).not.toContain('import("jspdf")');
    expect(builder).not.toContain("cloneNode(");
    expect(builder).not.toContain("pdf.addImage(");
  });

  it("keeps mobile and publish on the same renderQuoteBuffer pipeline", () => {
    const mobile = readFileSync("components/olivia-mobile/MobileResourcePreview.tsx", "utf8");
    const publish = readFileSync("lib/olivia/v2/toolExecutors/quote.ts", "utf8");
    expect(mobile).toContain('/render`');
    expect(publish).toContain("renderQuoteBuffer(quoteBeforePublish");
  });
});
