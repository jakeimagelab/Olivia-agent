import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensurePortalAccess } from "@/lib/clientPortal";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { isGenericPublicationType, PUBLICATION_TYPE_LABEL } from "@/lib/clientWorkspace/publications";
import { completeOpenStepTasksForManualSave, maybeAdvanceWorkflow } from "@/lib/workflowAutomation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ relatedType: string; relatedId: string }> };

// quote/contract는 각자 전용 publish 라우트(고객/프로젝트 자동 매칭까지 처리)를 그대로 쓰고,
// 이 라우트는 conti/셀렉갤러리/RAW다운로드/1차보정/최종사진처럼 이미 화면에서 client_id와
// workflow_run_id를 알고 있는 자료의 "공개" 버튼을 처리한다 — pcrm_publications를 그대로 재사용.
export async function POST(req: NextRequest, { params }: Params) {
  const { relatedType, relatedId } = await params;
  if (!isGenericPublicationType(relatedType)) {
    return NextResponse.json({ ok: false, error: "지원하지 않는 공개 유형입니다." }, { status: 400 });
  }
  const body = await req.json().catch(() => null) as { clientId?: string; workflowRunId?: string; title?: string } | null;
  const clientId = body?.clientId;
  const workflowRunId = body?.workflowRunId;
  if (!clientId || !workflowRunId) {
    return NextResponse.json({ ok: false, error: "clientId, workflowRunId가 필요합니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const title = body?.title || PUBLICATION_TYPE_LABEL[relatedType];

  const { data: existingPub } = await db
    .from("pcrm_publications")
    .select("id, version, status")
    .eq("workflow_run_id", workflowRunId)
    .eq("related_type", relatedType)
    .eq("related_id", relatedId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  let publicationId: string;
  if (existingPub && (existingPub.status === "draft" || existingPub.status === "internal_review" || existingPub.status === "revoked")) {
    await db.from("pcrm_publications").update({
      status: "published", published_at: now, published_by: "admin", revoked_at: null, updated_at: now,
    }).eq("id", existingPub.id);
    publicationId = existingPub.id;
  } else if (existingPub) {
    // 이미 공개된 적 있는 자료를 다시 공개 — 새 버전으로 남겨 이력을 보존한다.
    const { data: inserted, error } = await db.from("pcrm_publications").insert({
      client_id: clientId, workflow_run_id: workflowRunId, related_type: relatedType, related_id: relatedId,
      title, version: existingPub.version + 1, status: "published", published_at: now, published_by: "admin", created_by: "admin",
    }).select("id").single();
    if (error || !inserted) return NextResponse.json({ ok: false, error: error?.message ?? "공개 처리 실패" }, { status: 500 });
    publicationId = inserted.id;
  } else {
    const { data: inserted, error } = await db.from("pcrm_publications").insert({
      client_id: clientId, workflow_run_id: workflowRunId, related_type: relatedType, related_id: relatedId,
      title, status: "published", published_at: now, published_by: "admin", created_by: "admin",
    }).select("id").single();
    if (error || !inserted) return NextResponse.json({ ok: false, error: error?.message ?? "공개 처리 실패" }, { status: 500 });
    publicationId = inserted.id;
  }

  const portal = await ensurePortalAccess({ clientId }).catch(() => null);

  // conti는 quote/contract와 같은 워크플로우 스텝 키(conti)를 그대로 쓰는 유일한 범용 공개
  // 유형이라 "공개" 눌렀을 때만 여기서 워크플로우를 전진시킨다. 나머지 유형(셀렉갤러리/원본
  // 다운로드/1차보정/최종전달)은 이 relatedType 문자열이 워크플로우 스텝 키와 일치하지 않고
  // 각자 다른 방식으로 전진하므로 건드리지 않는다.
  if (relatedType === "conti") {
    await completeOpenStepTasksForManualSave(db, workflowRunId, "conti").catch(() => {});
    await maybeAdvanceWorkflow(db, workflowRunId, "conti").catch((err) => {
      console.error("[publications] maybeAdvanceWorkflow(conti) 실패", err);
    });
  }

  await recordPcrmActivitySafely(db, {
    clientId,
    workflowRunId,
    actorType: "admin",
    actorName: "관리자",
    actionType: `${relatedType}_published`,
    title: `${title}이(가) 고객 포털에 공개됨`,
    relatedType,
    relatedId,
  });

  return NextResponse.json({ ok: true, publicationId, portalToken: portal?.token ?? null });
}
