import { NextRequest } from "next/server";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { verifyPortalPhotoGallery } from "@/lib/pcrm/galleryServer";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";
import { advanceWorkflow } from "@/lib/workflowAutomation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 링크로 다시 접속해주세요.", 401);
  const body = await req.json().catch(() => null);
  const galleryId = String(body?.galleryId ?? "");
  const action = String(body?.action ?? "");
  if (!["view", "download", "approve"].includes(action)) return pcrmError("지원하지 않는 작업입니다.", 400);
  const verified = await verifyPortalPhotoGallery(context.db, context.session, galleryId, "final_delivery");
  if (!verified) return pcrmError("공개된 최종 납품 자료를 찾을 수 없습니다.", 404);
  const now = new Date().toISOString();
  let workflowRun: { id: string; current_step_key: string } | null = null;
  if (action === "approve") {
    const { data: run, error: workflowError } = await context.db.from("workflow_runs")
      .select("id,current_step_key")
      .eq("id", context.session.workflowRunId!)
      .maybeSingle();
    if (workflowError) return pcrmError(workflowError.message, 500);
    if (!run) return pcrmError("연결된 프로젝트 진행 정보를 찾을 수 없습니다.", 404);
    if (!["final_delivery", "revision", "reward"].includes(run.current_step_key)) {
      return pcrmError(`현재 ${run.current_step_key} 단계에서는 최종 납품을 확정할 수 없습니다.`, 409);
    }
    workflowRun = run;
  }

  const { data: existing } = await context.db.from("pcrm_delivery_confirmations")
    .select("*")
    .eq("workflow_run_id", context.session.workflowRunId!)
    .eq("publication_id", verified.publication.id)
    .maybeSingle();
  if (action === "approve" && existing?.approved_at) return pcrmOk({ confirmation: existing });

  const patch = {
    client_id: context.session.clientId,
    workflow_run_id: context.session.workflowRunId,
    publication_id: verified.publication.id,
    gallery_id: galleryId,
    first_viewed_at: existing?.first_viewed_at ?? now,
    last_downloaded_at: action === "download" ? now : existing?.last_downloaded_at ?? null,
    download_count: action === "download" ? (existing?.download_count ?? 0) + 1 : existing?.download_count ?? 0,
    approved_at: action === "approve" ? now : existing?.approved_at ?? null,
    approved_by: action === "approve" ? context.session.clientName : existing?.approved_by ?? "",
    approval_statement: action === "approve"
      ? String(body?.statement ?? "최종 납품 자료를 확인하고 승인합니다.").trim().slice(0, 2_000)
      : existing?.approval_statement ?? "",
  };
  const { data, error } = await context.db.from("pcrm_delivery_confirmations").upsert(patch, {
    onConflict: "workflow_run_id,publication_id",
  }).select().single();
  if (error) return pcrmError(error.message, 500);

  if (action === "approve") {
    const { data: publication, error: publicationError } = await context.db.from("pcrm_publications")
      .update({ status: "completed", approved_at: now, completed_at: now })
      .eq("id", verified.publication.id)
      .in("status", ["published", "viewed", "approved"])
      .select("id")
      .maybeSingle();
    if (publicationError) return pcrmError(publicationError.message, 500);
    if (!publication && verified.publication.status !== "completed") {
      return pcrmError("다른 화면에서 납품 상태가 변경되었습니다. 새로고침 후 다시 확인해주세요.", 409);
    }
    const workflowRunId = context.session.workflowRunId!;
    if (!workflowRun) return pcrmError("연결된 프로젝트 진행 정보를 찾을 수 없습니다.", 404);
    if (workflowRun.current_step_key !== "reward") {
      const advanced = await advanceWorkflow(context.db, {
        workflow_run_id: workflowRunId,
        from_step_key: workflowRun.current_step_key,
        to_step_key: "reward",
        reason: "고객 최종 확정",
      });
      if (advanced.skipped) return pcrmError(advanced.reason || "프로젝트 단계가 변경되었습니다.", 409);
    }
    await recordPcrmActivitySafely(context.db, {
      clientId: context.session.clientId,
      workflowRunId,
      actorType: "client",
      actorName: context.session.clientName,
      actionType: "final_delivery_approved",
      title: "최종 납품 승인",
      description: patch.approval_statement,
      relatedType: "final_delivery",
      relatedId: galleryId,
    });
  }
  return pcrmOk({ confirmation: data });
}
