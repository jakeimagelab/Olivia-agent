import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminSession } from "@/lib/passkey";
import { getVideoGenerationStatuses } from "@/lib/higgsfield/adapter";
import { publicHiggsfieldError } from "@/lib/higgsfield/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ requestIds: z.array(z.string().trim().min(1).max(180)).min(1).max(16) });

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    const { requestIds } = requestSchema.parse(body);
    const statuses = await getVideoGenerationStatuses(requestIds);
    return NextResponse.json({ ok: true, statuses }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const normalized = publicHiggsfieldError(error);
    const status = normalized.code === "not_configured" ? 503 : normalized.code === "validation" ? 400 : 502;
    return NextResponse.json({ ok: false, error: normalized.message, detail: normalized.detail, code: normalized.code }, { status });
  }
}
