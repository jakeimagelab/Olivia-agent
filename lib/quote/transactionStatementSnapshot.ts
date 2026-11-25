import { quoteDocumentDataFromRow, type QuoteDocumentData } from "./quoteDocumentData";

export type StatementLine = {
  name: string;
  detail: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string;
};

export type TransactionStatementSnapshot = {
  document: QuoteDocumentData;
  quoteNumber: string;
  recipient: { businessNumber: string; address: string; representative: string; businessCategory?: string; businessItem?: string };
  lines: StatementLine[];
};

function nonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function storedNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildTransactionStatementSnapshot(
  quote: Record<string, unknown>,
  client?: Record<string, unknown> | null,
): TransactionStatementSnapshot {
  const document = structuredClone(quoteDocumentDataFromRow(quote));
  document.customer = {
    ...document.customer,
    hospitalName: nonEmpty(document.customer.hospitalName, quote.hospital_name, client?.name),
    managerName: nonEmpty(document.customer.managerName, quote.contact_name, client?.manager_name),
    email: nonEmpty(document.customer.email, quote.email, client?.email),
    shootDate: nonEmpty(document.customer.shootDate, quote.shoot_date),
  };
  // Read the approved amounts directly. A catalog price or calculation may have changed since approval.
  document.supplyAmount = storedNumber(quote.supply_amount, document.supplyAmount);
  document.vat = storedNumber(quote.vat, document.vat);
  document.finalAmount = storedNumber(quote.total_amount, document.finalAmount);
  document.discountTotal = storedNumber(quote.discount_amount, document.discountTotal);
  document.depositRate = storedNumber(quote.deposit_rate, document.depositRate);
  document.depositAmount = storedNumber(quote.deposit_amount, document.depositAmount);
  document.balanceAmount = storedNumber(quote.balance_amount, document.balanceAmount);
  const form = quote.form_state && typeof quote.form_state === "object"
    ? quote.form_state as Record<string, unknown>
    : {};
  const sourceNumber = nonEmpty(quote.quote_number, document.customer.quoteNumber);
  if (form.brand !== "photoclinic" && form.brand !== "jakeimage") {
    if (quote.brand === "photoclinic" || quote.brand === "jakeimage") document.brand = quote.brand;
    else if (/^(?:JKQ|JI)-/i.test(sourceNumber)) document.brand = "jakeimage";
  }
  if (form.taxMode == null && quote.vat != null && document.vat === 0 && document.supplyAmount > 0) {
    document.taxMode = "excluded";
  }

  const sourceItems = Array.isArray(quote.items) ? quote.items : [];
  const lines = sourceItems.flatMap((value): StatementLine[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const name = nonEmpty(item.name);
    const detail = nonEmpty(item.detail);
    if (!name && !detail) return [];
    const amount = storedNumber(item.subtotal ?? item.amount, 0);
    return [{
      name,
      detail,
      quantity: storedNumber(item.qty ?? item.quantity, 1),
      unitPrice: storedNumber(item.unitPrice, amount),
      amount,
      note: nonEmpty(item.note, item.groupLabel) || (amount === 0 ? "서비스" : ""),
    }];
  });

  if (!lines.length) {
    const itemLines = [
      ...(document.packageItem ? [document.packageItem] : []),
      ...document.singleItems,
      ...document.optionItems,
    ];
    lines.push(
      ...itemLines.map((item) => ({ name: item.name, detail: item.detail || "", quantity: 1, unitPrice: item.amount, amount: item.amount, note: item.groupLabel || "" })),
      ...document.customItems.map((item) => ({ name: item.name, detail: item.detail, quantity: item.quantity ?? 1, unitPrice: item.unitPrice ?? item.amount, amount: item.amount, note: item.groupLabel ?? (item.discountable === false ? "할인 제외" : "") })),
      ...document.benefitItems.map((item) => ({ name: item.name, detail: "", quantity: 1, unitPrice: 0, amount: 0, note: "서비스" })),
    );
  }
  document.contentSubtotal = lines.reduce((total, line) => total + line.amount, 0);
  const fixedTotal = storedNumber(form.fixedTotal, -1);
  const afterDiscount = Math.max(0, document.contentSubtotal - document.discountTotal);
  if (fixedTotal >= 0) document.specialAdjustmentAmount = fixedTotal - afterDiscount;
  const roundDownUnit = Math.floor(storedNumber(form.roundDownUnit, 0));
  if (roundDownUnit > 1) document.roundDownAmount = (fixedTotal >= 0 ? fixedTotal : afterDiscount) % roundDownUnit;

  return {
    document,
    quoteNumber: sourceNumber,
    recipient: {
      businessNumber: nonEmpty(quote.business_registration_number, client?.business_registration_number),
      address: nonEmpty(quote.address, client?.address),
      representative: nonEmpty(quote.director_name, client?.director_name),
      businessCategory: nonEmpty(quote.business_category, client?.business_category),
      businessItem: nonEmpty(quote.business_item, client?.business_item),
    },
    lines,
  };
}

export const STATEMENT_UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export function transactionStatementPath(id: string) {
  return `/api/transaction-statements/${id}`;
}

export function transactionStatementMailPage(id: string) {
  return `/transaction-statements/${id}/send`;
}
