import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { completeOpenStepTasksForManualSave, maybeAdvanceWorkflow } from "@/lib/workflowAutomation";
import { resolveQuoteWorkflowLink } from "@/lib/quote/quoteWorkflowLink";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "최종완료" — 코드 요청서 2차(2026-08-16) 확정 원칙: "내부적으로 끝났다"와 "고객에게 공개했다"는
// 별개다. 대표가 이 버튼을 누르면(=문서를 직접 만든 것 자체가 이미 승인) 포털 공개 여부와 무관하게
// 그 즉시 워크플로우 quote 단계를 완료 처리하고 다음 단계(contract)로 진행한다. 승인 대기 없음.
// 포털 공개가 안 된 상태라도(=고객에게 아직 안 보여줬어도) 완료로 친다 — 그게 이번 원칙의 핵심.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const body = await req.json().catch(() => ({} as any));

  const { data: quote, error: quoteError } = await db.from("quotes").select("*").eq("id", id).maybeSingle();
  if (quoteError) return NextResponse.json({ ok: false, error: quoteError.message }, { status: 500 });
  if (!quote) return NextResponse.json({ ok: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  try {
    const link = await resolveQuoteWorkflowLink(db, quote, body);
    if (link.status === "needs_confirmation") {
      return NextResponse.json({ ok: false, needsConfirmation: true, candidate: link.candidate }, { status: 409 });
    }
    const { clientId, workflowRunId } = link;

    await completeOpenStepTasksForManualSave(db, workflowRunId, "quote");
    const result = await maybeAdvanceWorkflow(db, workflowRunId, "quote");

    await recordPcrmActivitySafely(db, {
      clientId,
      workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: "quote_completed",
      title: "견적서 단계가 최종완료 처리됨",
      relatedType: "quote",
      relatedId: id,
    });

    return NextResponse.json({ ok: true, clientId, workflowRunId, advanced: result.advanced });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "최종완료 처리 실패" }, { status: 500 });
  }
}
