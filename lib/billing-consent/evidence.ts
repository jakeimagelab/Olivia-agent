import { createHash, timingSafeEqual } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalBillingConsentJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function billingConsentEvidenceSha256(value: unknown) {
  return createHash("sha256")
    .update(canonicalBillingConsentJson(value))
    .digest("hex");
}

export function billingConsentPdfSha256(value: Buffer | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function billingConsentPdfMatches(value: Buffer | Uint8Array, expected: string) {
  const actualBuffer = Buffer.from(billingConsentPdfSha256(value));
  const expectedBuffer = Buffer.from(expected.toLowerCase());
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
