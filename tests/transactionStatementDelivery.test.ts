import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTransactionStatementSnapshot } from "@/lib/quote/transactionStatementSnapshot";
import { TransactionStatementError, type TransactionStatement } from "@/lib/quote/transactionStatementStore";
import { newStatementReceiptToken } from "@/lib/quote/transactionStatementReceipt";
import { sendTransactionStatement } from "@/lib/quote/sendTransactionStatement";
import { POST as confirmReceipt } from "@/app/api/statement-receipts/[token]/route";
import { POST as createStatement } from "@/app/api/transaction-statements/route";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({
  sendMail: vi.fn(),
  renderPdf: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("@/lib/mail/gmailTransport", () => ({
  gmailTransport: () => ({ user: "sender@example.test", client: { sendMail: mock.sendMail } }),
}));
vi.mock("@/lib/quote/renderTransactionStatementPdf", () => ({ renderTransactionStatementPdf: mock.renderPdf }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: mock.getDb }));

const id = "00000000-0000-4000-8000-000000000002";
const pdf = Buffer.from("%PDF-test");
const origin = "https://test.example";
const to = "recipient@example.test";
const subject = "테스트 거래명세서 발송";
const initialStatement: TransactionStatement = {
  id,
  statement_number: "TS-20261125-02",
  transaction_date: "2026-11-25",
  shoot_date: null,
  snapshot: buildTransactionStatementSnapshot({ quote_number: "PC-20261125-01", email: to, hospital_name: "테스트치과" }),
  status: "draft",
  pdf_path: null,
  confirmed_at: null,
  confirmed_by: null,
};

function fakeDb() {
  const row: TransactionStatement & { receipt_token_hash?: string; send_attempt_id: string | null } =
    { ...initialStatement, send_attempt_id: null };
  const upload = vi.fn().mockResolvedValue({ error: null });
  const db = {
    from: vi.fn(() => {
      type Column = keyof typeof row;
      const filters: Array<() => boolean> = [];
      let patch: Partial<typeof row> | undefined;
      const execute = async () => {
        if (!filters.every((matches) => matches())) return { error: null, data: null };
        return { error: null, data: { ...Object.assign(row, patch) } };
      };
      return {
        select() { return this; },
        update(value: Partial<typeof row>) { patch = value; return this; },
        eq(column: Column, value: unknown) { filters.push(() => row[column] === value); return this; },
        is(column: Column, value: unknown) { return this.eq(column, value); },
        in(column: Column, values: unknown[]) { filters.push(() => values.includes(row[column])); return this; },
        maybeSingle: execute,
        then: (resolve: (value: unknown) => void) => execute().then(resolve),
      };
    }),
    storage: { from: vi.fn(() => ({ upload })) },
  } as unknown as SupabaseClient;
  mock.getDb.mockReturnValue(db);
  return { db, row, upload };
}

afterEach(() => vi.resetAllMocks());

describe("거래명세서 발송·수신확인", () => {
  it("비로그인 생성 요청은 DB 접근 전에 막는다", async () => {
    const response = await createStatement(new NextRequest(`${origin}/api/transaction-statements`, { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mock.getDb).not.toHaveBeenCalled();
  });

  it("발송 확인값을 받기 전에는 메일을 보내지 않는다", async () => {
    const { db, row } = fakeDb();
    await expect(sendTransactionStatement(id, { to, subject, confirmed: false }, origin, db)).rejects.toMatchObject({ status: 400 });
    expect(mock.sendMail).not.toHaveBeenCalled();
    expect(row.status).toBe("draft");
  });

  it("PDF를 첨부하고 수신 링크를 발송한 뒤 상태를 기록한다", async () => {
    const { db, row, upload } = fakeDb();
    mock.renderPdf.mockResolvedValue(pdf);
    mock.sendMail.mockImplementation(async () => { expect(row.status).toBe("draft"); });
    const result = await sendTransactionStatement(id, { to, subject, confirmed: true }, origin, db);
    expect(mock.renderPdf).toHaveBeenCalledWith(expect.objectContaining({ id }), true);
    expect(upload).toHaveBeenCalledWith(`${id}/sent.pdf`, pdf, expect.objectContaining({ contentType: "application/pdf" }));
    expect(mock.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to, subject,
      text: expect.stringMatching(/\/client-portal\/transaction-statement\/[\w-]{43}/),
      attachments: [{ filename: "TS-20261125-02.pdf", content: pdf, contentType: "application/pdf" }],
    }));
    expect(row).toMatchObject({ status: "sent", sent_at: result.sentAt, send_attempt_id: null });
    expect(row.receipt_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("직인이 없거나 SMTP 실패 시 발송 대기를 유지하고 재시도를 허용한다", async () => {
    const { db, row } = fakeDb();
    mock.renderPdf.mockRejectedValueOnce(new TransactionStatementError("공급자 직인 파일을 등록한 후 발송할 수 있습니다.", 422));
    await expect(sendTransactionStatement(id, { to, subject, confirmed: true }, origin, db)).rejects.toMatchObject({ status: 422 });
    expect(mock.sendMail).not.toHaveBeenCalled();
    mock.renderPdf.mockResolvedValue(pdf);
    mock.sendMail.mockRejectedValueOnce(new Error("SMTP rejected"));
    await expect(sendTransactionStatement(id, { to, subject, confirmed: true }, origin, db)).rejects.toMatchObject({ status: 502 });
    expect(row).toMatchObject({ status: "draft", send_attempt_id: null });
  });

  it("다른 토큰은 막고 첫 확인자의 이름과 시각을 보존한다", async () => {
    const { row } = fakeDb();
    const receipt = newStatementReceiptToken();
    row.receipt_token_hash = receipt.hash;
    row.status = "sent";
    const submit = async (token: string, name: string) => confirmReceipt(
      new Request(`${origin}/api/statement-receipts/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect((await submit(newStatementReceiptToken().token, "다른 사람")).status).toBe(404);
    const first = await (await submit(receipt.token, "첫 확인자")).json();
    const second = await (await submit(receipt.token, "다른 이름")).json();
    expect(first).toMatchObject({ ok: true, confirmedBy: "첫 확인자", confirmedAt: expect.any(String) });
    expect(second).toEqual(first);
    expect(row.status).toBe("confirmed");
  });
});
