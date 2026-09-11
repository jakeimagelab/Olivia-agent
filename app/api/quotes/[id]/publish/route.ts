import { NextRequest, NextResponse } from "next/server";
import { publishQuoteService } from "@/lib/publications/publishResource";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  try {
    return NextResponse.json(await publishQuoteService(id, {
      forceClientId: typeof body.forceClientId === "string" ? body.forceClientId : undefined,
      forceCreateNew: body.forceCreateNew === true,
    }));
  } catch (error) {
    const code = error instanceof OliviaToolError ? error.code : "PUBLISH_FAILED";
    const status = code === "NOT_FOUND" ? 404 : code === "AMBIGUOUS" ? 409 : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "견적서 공개 실패", code }, { status });
  }
}
