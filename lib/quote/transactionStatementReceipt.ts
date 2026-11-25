import { createHash, randomBytes } from "node:crypto";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function statementReceiptTokenHash(token: string) {
  return TOKEN.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

export function newStatementReceiptToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export function statementReceiptPage(token: string) {
  return `/client-portal/transaction-statement/${token}`;
}

export function statementReceiptEndpoint(token: string) {
  return `/api/statement-receipts/${token}`;
}
