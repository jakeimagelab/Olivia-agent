import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as receivedDocument } from "@/app/api/client-portal/document-mail/[token]/route";
import { applyCustomerContractSignature, buildContractHtmlFromRow } from "@/lib/contract/contractDocument";
import {
  createDocumentMailToken, documentMailHash, loadReceivedDocuments, readDocumentMailProgress, receivedPdfFileName, shareDocumentScope,
  visibleDeliveredDocuments, type DocumentMailDelivery, type DocumentMailSource,
} from "@/lib/document-mail/repository";
import { previewDocumentMail, selectDocumentMailSources, sendDocumentMail } from "@/lib/document-mail/send";
import { documentPortalHref, readDocumentPortalTarget } from "@/lib/document-mail/portal";
import { defaultDocumentMailMessage, documentMailBody } from "@/lib/document-mail/email";
import { formatDocumentMailSubject } from "@/lib/document-mail/shared";

const quoteId = "41000000-0000-4000-8000-000000000001";
const contractId = "41000000-0000-4000-8000-000000000002";
const statementId = "41000000-0000-4000-8000-000000000003";
const requestId = "41000000-0000-4000-8000-000000000004";
const version = "2026-11-26T03:00:00.000Z";

const mocks = vi.hoisted(() => ({
  mail: vi.fn<(mail: unknown) => Promise<{ accepted: string[] }>>(async () => ({ accepted: ["test@example.test"] })),
  quote: vi.fn(async () => ({ buffer: Buffer.from("quote-pdf") })),
  contract: vi.fn(async () => Buffer.from("contract-pdf")),
  statement: vi.fn(async () => Buffer.from("statement-pdf")),
  withContext: vi.fn(async (render: (context: object) => Promise<unknown>) => render({})),
  adminDb: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: mocks.adminDb }));
vi.mock("@/lib/mail/gmailTransport", () => ({ gmailTransport: () => ({ user: "sender@example.test", client: { sendMail: mocks.mail } }) }));
vi.mock("@/lib/quote/renderQuotePdf", () => ({ renderQuoteBuffer: mocks.quote }));
vi.mock("@/lib/contract/renderContractPdf", () => ({ renderA4HtmlPdf: mocks.contract }));
vi.mock("@/lib/quote/renderTransactionStatementPdf", () => ({ renderTransactionStatementPdf: mocks.statement }));
vi.mock("@/lib/documentPdfBrowser", () => ({ withDocumentPdfContext: mocks.withContext }));

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
  const upload = vi.fn<(path: string, body: Buffer) => Promise<{ error: null }>>(async () => ({ error: null }));
  const remove = vi.fn<(paths: string[]) => Promise<{ error: null }>>(async () => ({ error: null }));
  const createSignedUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.example.test/${path}` }, error: null }));
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
        gt(key: string, value: string) { filters.push((row) => String(row[key]) > value); return query; },
        update(value: Record<string, unknown>) { patch = value; return query; },
        insert(value: Record<string, unknown>) { data[table].push(value); return Promise.resolve({ error: null }); },
        maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: execute(), error: null }).then(resolve),
      };
      return query;
    },
    storage: { from: () => ({ upload, remove, createSignedUrl }) },
  };
  return { db: db as never, data, upload, remove, createSignedUrl };
}

describe("document mail", () => {
  it("uses only selected document names in quote, statement, contract order in the subject", () => {
    const quoteAndContract = [{ kind: "contract" }, { kind: "quote" }] as const;
    expect(formatDocumentMailSubject("포토클리닉", "가상안과", quoteAndContract))
      .toBe("[포토클리닉입니다] 가상안과 견적서/계약서 송부 안내");
    expect(formatDocumentMailSubject("포토클리닉", "가상안과", [...quoteAndContract, { kind: "statement" }]))
      .toBe("[포토클리닉입니다] 가상안과 견적서/거래명세서/계약서 송부 안내");
    expect(formatDocumentMailSubject("제이크이미지연구소", "테스트", [{ kind: "statement" }]))
      .toBe("[제이크이미지연구소입니다] 테스트 거래명세서 송부 안내");
  });

  it("serves the contract terms before signature and issues a PDF link only to the signed copy", async () => {
    const { db, data, createSignedUrl } = mailDb();
    mocks.adminDb.mockReturnValue(db);
    const token = createDocumentMailToken();
    const delivery = {
      token_hash: documentMailHash(token), state: "sent", expires_at: new Date(Date.now() + 60_000).toISOString(),
      documents: [
        { kind: "quote", number: quote.quote_number, title: "견적서", path: "quote.pdf" },
        { kind: "contract", number: quote.quote_number, title: "계약서", path: "unsigned.pdf" },
      ],
      contract_html: "<html><head><base href=\"https://example.test/\"></head><body>서명할 계약 조항</body></html>",
      signed_pdf_path: null, signed_at: null, signer_name: null,
    };
    data.document_mail_deliveries.push(delivery);
    const get = (params: string) => receivedDocument(new NextRequest(`https://example.test/api/client-portal/document-mail/${token}?${params}`), { params: Promise.resolve({ token }) });
    expect((await get("kind=contract")).status).toBe(403);
    expect((await get("kind=contract&download=1")).status).toBe(403);
    expect((await get("kind=contract&download=1&preview=1")).status).toBe(403);
    const preview = await get("kind=contract&preview=1");
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toMatch(/^text\/html/);
    expect(preview.headers.get("content-security-policy")).toContain("sandbox");
    expect(await preview.text()).toContain("서명할 계약 조항");
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect((await get("kind=quote&download=1")).headers.get("location")).toBe("https://storage.example.test/quote.pdf");
    Object.assign(delivery, { signed_pdf_path: "signed.pdf", signed_at: version, signer_name: "가상 고객" });
    const signed = await get("kind=contract&download=1");
    expect(signed.status).toBe(303);
    expect(signed.headers.get("location")).toBe("https://storage.example.test/signed.pdf");
    expect(createSignedUrl).toHaveBeenLastCalledWith("signed.pdf", 300, { download: `계약서_${quote.quote_number}_서명본.pdf` });
  });

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
    mocks.withContext.mockClear();
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
    expect(mocks.withContext).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(3);
    const { text: body, html } = mocks.mail.mock.calls[0][0] as { text: string; html: string };
    expect(body).toContain("요청하신 문서입니다.");
    expect(body).toContain("계약서는 문서함에서 전자서명해 주세요.");
    const token = /\/received\/([\w-]{43})/.exec(body)![1];
    expect(html).toContain(`href="http://localhost:3000/client-portal/documents/received/${token}"`);
    expect(html).toContain(">문서 확인하기</a>");
    expect(html).not.toContain(`>${token}`);
    expect(data.document_mail_deliveries[0]).toMatchObject({ token_hash: documentMailHash(token), state: "sent" });
    expect(JSON.stringify(data.document_mail_deliveries)).not.toContain(token);
    await expect(readDocumentMailProgress(db, requestId)).resolves.toEqual({ state: "sent", sentAt: sent.sentAt, documentCount: 3 });
  });

  it("uses a named greeting and keeps the portal URL inside the mail button", () => {
    expect(defaultDocumentMailMessage("photoclinic", "김가상대표원장님").split("\n")).toEqual([
      "안녕하세요. 김가상 대표원장님", "포토클리닉 정연호입니다.", "견적 및 계약 관련 서류를 보내드립니다.",
      "아래 링크에서 확인 및 다운로드 가능합니다.", "감사합니다.", "정연호 드림.",
    ]);
    expect(defaultDocumentMailMessage("photoclinic", "")).toMatch(/^안녕하세요\.\n/);
    const portalUrl = new URL("https://example.test/client-portal/documents/received/sample");
    const { html, text } = documentMailBody({
      brand: "photoclinic", message: "<테스트>\n감사합니다.", documents: [], portalUrl, requiresSignature: false,
    });
    expect(html).toContain("&lt;테스트&gt;<br>감사합니다.");
    expect(html.split('href="')[1]?.split('"')[0]).toBe(portalUrl.href);
    expect(html.replace(/<[^>]+>/g, "")).not.toContain(portalUrl.href);
    expect(text).toContain(portalUrl.href);
  });

  it("waits for all parallel PDF writes before cleaning up a failed send", async () => {
    mocks.mail.mockClear();
    const { db, data, remove } = mailDb();
    const rendering = Promise.withResolvers<void>();
    const contractPdf = Promise.withResolvers<Buffer<ArrayBuffer>>();
    mocks.quote.mockRejectedValueOnce(new Error("quote-render-error"));
    mocks.contract.mockImplementationOnce(() => {
      rendering.resolve();
      return contractPdf.promise;
    });
    const sending = sendDocumentMail(db, { kind: "quote", id: quoteId }, {
      requestId, confirmed: true, to: "test@example.test", subject: "문서", message: "안녕하세요.",
      documents: [{ kind: "quote", id: quoteId, version }, { kind: "contract", id: contractId, version }],
    }, "http://localhost:3000");
    const failure = expect(sending).rejects.toMatchObject({ code: "NOT_SENT" });
    await rendering.promise;
    expect(data.document_mail_deliveries[0].state).toBe("preparing");
    expect(remove).not.toHaveBeenCalled();
    contractPdf.resolve(Buffer.from("prepared-contract"));
    await failure;
    await expect(readDocumentMailProgress(db, requestId)).resolves.toMatchObject({ state: "failed" });
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/\/contract\.pdf$/)]);
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("keeps the same quote workspace when opening a linked contract and remembers a statement-only send there", async () => {
    const anchor = { kind: "quote", id: quoteId } as const;
    const url = new URL(documentPortalHref(anchor, "contract", contractId), "https://olivia.example.test");
    expect(url.pathname).toBe("/quote");
    expect(readDocumentPortalTarget("quote", url.searchParams)).toEqual({ anchor, tab: "contract", documentId: contractId });
    expect(readDocumentPortalTarget("quote", new URLSearchParams({ resourceId: quoteId }))).toBeNull();

    const { db, data } = mailDb();
    data.contracts.push({ ...contract, id: requestId, source_quote_id: "unrelated-quote" });
    const preview = await previewDocumentMail(db, anchor);
    expect(preview.documents.map(({ id }) => id)).toEqual([quoteId, statementId, contractId]);
    expect(preview.documents[1].canRequestReceipt).toBe(true);
    const recipient = "test@example.test";
    await sendDocumentMail(db, anchor, {
      requestId, confirmed: true, to: recipient, subject: "거래명세서", message: "거래명세서를 보내드립니다.",
      documents: [{ kind: "statement", id: statementId, version }],
    }, "http://localhost:3000");
    expect(data.document_mail_deliveries[0]).toMatchObject({ quote_id: quoteId, documents: [{ kind: "statement" }] });
    expect((await previewDocumentMail(db, anchor)).latest?.recipient).toBe(recipient);
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
