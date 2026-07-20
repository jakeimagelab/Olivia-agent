import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ACTIVE_WORKFLOW_STEPS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const clientId = session.clientId;

  const [clientRes, galleryRes, revisionRes, reviewRes, eventsRes, perRes, workflowRes, quotesRes, contractsRes, contiRes] = await Promise.all([
    db.from("clients").select("*").eq("id", clientId).single(),
    // photo_galleries가 실제로 갤러리가 쌓이는 테이블이다 (구 galleries 테이블은 아무도 쓰지 않아 항상 비어있었음).
    db.from("photo_galleries").select("id,description,shoot_date,gallery_type,nas_link,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
    db.from("client_revision_requests").select("id,title,status,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(5),
    db.from("client_reviews").select("id,overall_rating,created_at").eq("client_id", clientId).limit(1),
    db.from("client_portal_events").select("event_type,memo,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
    db.from("clients").select("available_points,total_earned_points,reward_tier,per_joined").eq("id", clientId).single(),
    db.from("workflow_runs").select("id,project_id,project_name,current_step_key,status,shoot_date,next_action").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("quotes").select("id,quote_number,title,supply_amount,vat,total_amount,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(5),
    db.from("contracts").select("id,quote_number,signature_data_url,quote_data,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(5),
    db.from("conti_saves").select("id,title,result,saved_at").eq("client_id", clientId).order("saved_at", { ascending: false }).limit(5),
  ]);

  const visibleStepKeys = new Set(ACTIVE_WORKFLOW_STEPS.filter((step) => step.visible_to_client).map((step) => step.key));
  const workflowRun = workflowRes.data ?? null;
  const { data: approvalRows } = workflowRun?.id
    ? await db
        .from("agent_approvals")
        .select("id,project_id,workflow_run_id,workflow_step_key,title,description,preview_data,status,approved_at,updated_at")
        .eq("client_id", clientId)
        .eq("workflow_run_id", workflowRun.id)
        .in("status", ["approved", "revision_requested"])
        .order("updated_at", { ascending: false })
    : { data: [] as any[] };

  const approvedByStep = new Map<string, any>();
  for (const approval of approvalRows ?? []) {
    if (!visibleStepKeys.has(approval.workflow_step_key) || approvedByStep.has(approval.workflow_step_key)) continue;
    approvedByStep.set(approval.workflow_step_key, approval);
  }
  const approvedSteps = ACTIVE_WORKFLOW_STEPS
    .filter((step) => approvedByStep.has(step.key))
    .map((step) => ({
      ...approvedByStep.get(step.key),
      stepKey: step.key,
      stepName: step.name,
      stage: step.stage,
      relatedFeature: step.related_feature,
    }));

  return NextResponse.json({
    ok: true,
    session,
    client: clientRes.data,
    galleries: galleryRes.data ?? [],
    revisions: revisionRes.data ?? [],
    hasReview: (reviewRes.data?.length ?? 0) > 0,
    events: eventsRes.data ?? [],
    per: perRes.data,
    workflowRun,
    approvedSteps,
    quotes: quotesRes.data ?? [],
    contracts: contractsRes.data ?? [],
    contiSaves: contiRes.data ?? [],
  });
}
