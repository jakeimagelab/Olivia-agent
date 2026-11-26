import { describe, expect, it, vi } from "vitest";
import { applyCustomerContractSignature, buildContractHtmlFromRow } from "@/lib/contract/contractDocument";
import {
  createDocumentMailToken, documentMailHash, loadReceivedDocuments, receivedPdfFileName, shareDocumentScope,
  visibleDeliveredDocuments, type DocumentMailDelivery, type DocumentMailSource,
} from "@/lib/document-mail/repository";
import { selectDocumentMailSources, sendDocumentMail } from "@/lib/document-mail/send";

const quoteId = "41000000-0000-4000-8000-000000000001";
const contractId = "41000000-0000-4000-8000-000000000002";
const statementId = "41000000-0000-4000-8000-000000000003";
const requestId = "41000000-0000-4000-8000-000000000004";
const version = "2026-11-26T03:00:00.000Z";

const mocks = vi.hoisted(() => ({
  mail: vi.fn(async (_mail) => ({ accepted: ["test@example.test"] })),
  quote: vi.fn(async () => ({ buffer: Buffer.from("quote-pdf") })),
  contract: vi.fn(async () => Buffer.from("contract-pdf")),
  statement: vi.fn(async () => Buffer.from("statement-pdf")),
}));
vi.mock("@/lib/mail/gmailTransport", () => ({ gmailTransport: () => ({ user: "sender@example.test", client: { sendMail: mocks.mail } }) }));
vi.mock("@/lib/quote/renderQuotePdf", () => ({ renderQuoteBuffer: mocks.quote }));
vi.mock("@/lib/contract/renderContractPdf", () => ({ renderA4HtmlPdf: mocks.contract }));
vi.mock("@/lib/quote/renderTransactionStatementPdf", () => ({ renderTransactionStatementPdf: mocks.statement }));

const quote = { id: quoteId, quote_number: "PCQ-20261126-001", title: "테스트 견적서", hospital_name: "테스트", updated_at: version };
const contract = {
  id: contractId, hospital_name: "테스트", source_quote_id: quoteId, updated_at: version,
  quote_data: { hospitalName: "테스트", quoteNumber: quote.quote_number, items: [] },
  signature_data_url: "data:image/png;base64,c3VwcGxpZXI=",
};
const statement = {
  id: statementId, quote_id: quoteId, statement_number: "TS-20261126-01", status: "draft", updated_at: version,
  snapshot: { document: { brand: "photoclinic", customer: { hospitalName: "테스트", email: "test@example.test" } } },
};

function mailDb() {
  const data: Record<string, Record<string, unknown>[]> = {
    quotes: [quote], contracts: [contract], transaction_statements: [statement], document_mail_deliveries: [],
  };
  const upload = vi.fn(async (_path: string, _body: Buffer) => ({ error: null }));
  const db = {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      const execute = () => {
        const rows = data[table].filter((row) => filters.every((filter) => filter(row)));
        if (patch) rows.forEach((row) => Object.assign(row, patch));
        return rows;
      };
      const query = {
        select: () => query, order: () => query, limit: () => query,
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
        not(key: string) { filters.push((row) => Boolean(row[key])); return query; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
        update(value: Record<string, unknown>) { patch = value; return query; },
        insert(value: Record<string, unknown>) { data[table].push(value); return Promise.resolve({ error: null }); },
        maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: execute(), error: null }).then(resolve),
      };
      return query;
    },
    storage: { from: () => ({ upload, remove: vi.fn(async () => ({ error: null })) }) },
  };
  return { db: db as never, data, upload };
}

describe("document mail", () => {
  it("uses the direct quote linkage and rejects mismatched customers, stale versions and duplicates", () => {
    expect(shareDocumentScope(quote, contract, "contract")).toBe(true);
    expect(shareDocumentScope(quote, statement, "statement")).toBe(true);
    expect(shareDocumentScope({ ...quote, client_id: "customer-a" }, { ...contract, client_id: "customer-b" }, "contract")).toBe(false);
    expect(shareDocumentScope({ ...quote, id: "different-quote" }, contract, "contract")).toBe(false);
    const choice = { kind: "quote", id: quoteId, version, number: quote.quote_number, title: quote.title, requiresSignature: false } as const;
    const candidates: DocumentMailSource[] = [{ choice, row: quote }];
    expect(selectDocumentMailSources(candidates, [choice])).toEqual(candidates);
    expect(() => selectDocumentMailSources(candidates, [{ ...choice, version: null }])).toThrow("변경되었습니다");
    expect(() => selectDocumentMailSources(candidates, [choice, choice])).toThrow("종류별로");
  });

  it("sends one email with selected quote, statement and contract snapshots and retries idempotently", async () => {
    mocks.mail.mockClear();
    const { db, data, upload } = mailDb();
    const anchor = { kind: "quote", id: quoteId } as const;
    const input = {
      requestId, confirmed: true, to: "test@example.test", subject: "테스트 문서", message: "요청하신 문서입니다.",
      documents: [{ kind: "quote", id: quoteId, version }, { kind: "statement", id: statementId, version }, { kind: "contract", id: contractId, version }],
    };
    const sent = await sendDocumentMail(db, anchor, input, "http://localhost:3000");
    expect(sent.documentCount).toBe(3);
    expect(await sendDocumentMail(db, anchor, input, "http://localhost:3000")).toEqual(sent);
    expect(mocks.mail).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(3);
    const body = (mocks.mail.mock.calls[0][0] as { text: string }).text;
    expect(body).toContain("요청하신 문서입니다.");
    expect(body).toContain("계약서는 문서함에서 전자서명해 주세요.");
    const token = /\/received\/([\w-]{43})/.exec(body)![1];
    expect(data.document_mail_deliveries[0]).toMatchObject({ token_hash: documentMailHash(token), state: "sent" });
    expect(JSON.stringify(data.document_mail_deliveries)).not.toContain(token);
  });

  it("puts the customer signature on the archived document and retains the supplier's signature", () => {
    const template = buildContractHtmlFromRow(contract, { customerSignaturePlaceholders: true, baseUrl: "https://example.test" });
    const hash = documentMailHash("original pdf");
    const signed = applyCustomerContractSignature(template, {
      name: "고객 <대표>", signedAt: version, image: "data:image/png;base64,Y3VzdG9tZXI=", originalPdfSha256: hash,
    });
    expect(signed).toContain("고객 &lt;대표&gt;");
    expect(signed).toContain("c3VwcGxpZXI=");
    expect(signed).toContain("Y3VzdG9tZXI=");
    expect(signed).toContain(hash);
    expect(signed).not.toContain("olivia-customer-signature");
    expect(signed).toContain("테스트");
  });

  it("rejects malformed links before querying and selects the stored signed file", async () => {
    const from = vi.fn();
    expect(await loadReceivedDocuments({ from } as never, "invalid")).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(createDocumentMailToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = {
      documents: [{ kind: "contract", number: quote.quote_number, title: "계약서", path: "original.pdf" }],
      signed_pdf_path: "signed.pdf", signed_at: version, signer_name: "테스트 고객",
    } as DocumentMailDelivery;
    const [document] = visibleDeliveredDocuments(row);
    expect(document.path).toBe("signed.pdf");
    expect(receivedPdfFileName(document)).toContain("_서명본.pdf");
  });
});
