import { createHmac, timingSafeEqual } from "node:crypto";

export const QUOTE_PRINT_AUTH_HEADER = "x-olivia-quote-print-token";

function quotePrintSecret() {
  const secret = process.env.QUOTE_PRINT_SECRET
    || process.env.INTERNAL_API_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("견적서 print route 인증 비밀값이 설정되지 않았습니다.");
  return secret;
}

export function createQuotePrintToken(quoteId: string) {
  return createHmac("sha256", quotePrintSecret())
    .update(`olivia:quote-print:${quoteId}`)
    .digest("base64url");
}

export function verifyQuotePrintToken(quoteId: string, token: string | null | undefined) {
  if (!token) return false;
  const expected = Buffer.from(createQuotePrintToken(quoteId));
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
