import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import {
  quoteReaderFailureDetails,
  quoteReaderModel,
  readQuoteRequestWithAI,
} from "@/lib/quote/aiQuoteReader";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return Response.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
  }
  const startedAt = performance.now();
  const model = quoteReaderModel();
  try {
    await readQuoteRequestWithAI({
      text: "테스트의원 견적서 만들어줘\n프로필촬영",
      today: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
    });
    return Response.json({ ok: true, reason: null, model, ms: Math.round(performance.now() - startedAt) });
  } catch (error) {
    const failure = quoteReaderFailureDetails(error);
    return Response.json({ ok: false, reason: failure.code, model, ms: Math.round(performance.now() - startedAt) });
  }
}
