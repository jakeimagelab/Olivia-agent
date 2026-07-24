import { NextRequest } from "next/server";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";
import { getPcrmSceneKey, validateShortText } from "@/lib/pcrm/collaboration";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getPublishedConti(context: NonNullable<Awaited<ReturnType<typeof getPortalProjectContext>>>, contiId: string) {
  if (!isPcrmUuid(contiId)) return null;
  const [{ data: conti }, { data: publication }] = await Promise.all([
    context.db.from("conti_saves").select("id,client_id,workflow_run_id,title,result")
      .eq("id", contiId).eq("client_id", context.session.clientId).eq("workflow_run_id", context.session.workflowRunId).maybeSingle(),
    context.db.from("pcrm_publications").select("id")
      .eq("client_id", context.session.clientId).eq("workflow_run_id", context.session.workflowRunId)
      .eq("related_type", "conti").eq("related_id", contiId)
      .in("status", ["published", "viewed", "revision_requested", "approved", "completed"]).maybeSingle(),
  ]);
  return conti && publication ? conti : null;
}

export async function GET(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const contiId = req.nextUrl.searchParams.get("contiId") ?? "";
  const conti = await getPublishedConti(context, contiId);
  if (!conti) return pcrmError("공개된 촬영 콘티를 찾을 수 없습니다.", 404);
  const { data, error } = await context.db.from("pcrm_conti_scene_feedback")
    .select("*").eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId).eq("conti_id", contiId)
    .order("scene_index");
  if (error) return pcrmError(error.message, 500);
  return pcrmOk({ feedback: data ?? [] });
}

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const body = await req.json().catch(() => null);
  const contiId = String(body?.contiId ?? "");
  const conti = await getPublishedConti(context, contiId);
  if (!conti) return pcrmError("공개된 촬영 콘티를 찾을 수 없습니다.", 404);
  const scenes = Array.isArray((conti.result as any)?.conti) ? (conti.result as any).conti : [];
  const sceneIndex = Number(body?.sceneIndex);
  if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= scenes.length) return pcrmError("촬영 장면을 찾을 수 없습니다.");
  const scene = scenes[sceneIndex] as Record<string, unknown>;
  const sceneKey = getPcrmSceneKey(scene, sceneIndex);
  if (String(body?.sceneKey ?? "") !== sceneKey) return pcrmError("촬영 장면 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  const status = String(body?.status ?? "");
  if (!["approved", "commented", "revision_requested"].includes(status)) return pcrmError("피드백 상태가 올바르지 않습니다.");
  const feedback = validateShortText(body?.feedback, "의견", 2000, status !== "approved");
  if (!feedback.ok) return pcrmError(feedback.error);
  const sceneTitle = String(scene.title ?? scene.category ?? `장면 ${sceneIndex + 1}`).trim().slice(0, 200);
  const now = new Date().toISOString();
  const { data, error } = await context.db.from("pcrm_conti_scene_feedback").upsert({
    client_id: context.session.clientId,
    workflow_run_id: context.session.workflowRunId,
    conti_id: contiId,
    scene_key: sceneKey,
    scene_index: sceneIndex,
    scene_title: sceneTitle,
    status,
    feedback: feedback.value,
    admin_reply: "",
    submitted_at: now,
    resolved_at: null,
  }, { onConflict: "workflow_run_id,conti_id,scene_key" }).select().single();
  if (error) return pcrmError(error.message, 500);
  await recordPcrmActivitySafely(context.db, {
    clientId: context.session.clientId,
    workflowRunId: context.session.workflowRunId,
    actorType: "client",
    actorName: context.session.clientName,
    actionType: `conti_scene_${status}`,
    title: `${sceneTitle} ${status === "approved" ? "승인" : status === "revision_requested" ? "수정 요청" : "의견 등록"}`,
    description: feedback.value,
    relatedType: "conti_scene",
    relatedId: data.id,
  });
  return pcrmOk({ feedback: data });
}
