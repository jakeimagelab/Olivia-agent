import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensurePortalAccess } from "@/lib/clientPortal";
import { completeOpenStepTasksForManualSave, maybeAdvanceWorkflow } from "@/lib/workflowAutomation";
import { resolveQuoteWorkflowLink } from "@/lib/quote/quoteWorkflowLink";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 견적서를 고객 포털에 처음 공개할 때: 고객 자동 연결/생성 → 프로젝트(워크플로우) 자동 시작 →
// 포털 자동 발급까지 한 번에 처리한다. 재공개(수정 후 다시 공개)는 같은 프로젝트를 재사용하되
// 이미 고객이 열람/응답한 이력(status가 draft가 아님)이 있으면 새 버전으로 남긴다.
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

    await db.from("quotes").update({ status: "published" }).eq("id", id);

    const now = new Date().toISOString();
    const { data: existingPub } = await db
      .from("pcrm_publications")
      .select("id, version, status")
      .eq("workflow_run_id", workflowRunId)
      .eq("related_type", "quote")
      .eq("related_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPub && existingPub.status === "draft") {
      await db.from("pcrm_publications").update({ status: "published", published_at: now, published_by: "admin", updated_at: now }).eq("id", existingPub.id);
    } else if (existingPub) {
      // 고객이 이미 열람/승인/수정요청한 뒤 다시 공개하는 경우 — 새 버전으로 남겨 이력을 보존한다.
      await db.from("pcrm_publications").insert({
        client_id: clientId,
        workflow_run_id: workflowRunId,
        related_type: "quote",
        related_id: id,
        title: quote.title || quote.quote_number || "견적서",
        version: existingPub.version + 1,
        status: "published",
        published_at: now,
        published_by: "admin",
        created_by: "admin",
      });
    } else {
      await db.from("pcrm_publications").insert({
        client_id: clientId,
        workflow_run_id: workflowRunId,
        related_type: "quote",
        related_id: id,
        title: quote.title || quote.quote_number || "견적서",
        status: "published",
        published_at: now,
        published_by: "admin",
        created_by: "admin",
      });
    }

    // 포털 토큰은 고객 1명당 1개만 재사용한다(workflowRunId를 넘기지 않으면 client_portal_access가
    // 프로젝트 단위가 아니라 고객 단위로 토큰을 찾거나 새로 만든다 — lib/clientPortal.ts 참고).
    // 만료일도 더 이상 두지 않는다(고객이 [공유 끊기]를 누르기 전까지 유지).
    const portal = await ensurePortalAccess({ clientId, email: quote.email || undefined });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://olivia.photoclinic.kr";
    const portalUrl = `${baseUrl}/client-portal/access/${portal.token}`;

    await recordPcrmActivitySafely(db, {
      clientId,
      workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: "quote_published",
      title: "견적서가 고객 포털에 공개됨",
      relatedType: "quote",
      relatedId: id,
    });

    // "포털 공개"를 실제로 눌렀을 때만 워크플로우를 다음 단계로 진행시킨다(임시저장/자동저장은
    // 저장만 하고 전진시키지 않음).
    await completeOpenStepTasksForManualSave(db, workflowRunId, "quote").catch(() => {});
    await maybeAdvanceWorkflow(db, workflowRunId, "quote").catch((err) => {
      console.error("[quotes] maybeAdvanceWorkflow 실패", err);
    });

    return NextResponse.json({ ok: true, clientId, workflowRunId, portalUrl });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "견적서 공개 실패" }, { status: 500 });
  }
}
