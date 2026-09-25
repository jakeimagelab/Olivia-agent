import { NextRequest, NextResponse } from "next/server";
import { completeQuote } from "@/lib/core/commands/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "최종완료" — 코드 요청서 2차(2026-08-16) 확정 원칙: "내부적으로 끝났다"와 "고객에게 공개했다"는
// 별개다. 대표가 이 버튼을 누르면(=문서를 직접 만든 것 자체가 이미 승인) 포털 공개 여부와 무관하게
// 그 즉시 워크플로우 quote 단계를 완료 처리하고 다음 단계(contract)로 진행한다. 승인 대기 없음.
// 포털 공개가 안 된 상태라도(=고객에게 아직 안 보여줬어도) 완료로 친다 — 그게 이번 원칙의 핵심.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as any));
  const result = await completeQuote(id, {
    forceClientId: typeof body.forceClientId === "string" ? body.forceClientId : undefined,
    forceCreateNew: body.forceCreateNew === true,
  });
  if (!result.ok) {
    const candidate = result.details?.candidate;
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "AMBIGUOUS" ? 409 : 500;
    return NextResponse.json({
      ok: false,
      error: result.reason,
      code: result.code,
      ...(candidate ? { needsConfirmation: true, candidate } : {}),
    }, { status });
  }
  return NextResponse.json({ ok: true, ...result.value });
}
