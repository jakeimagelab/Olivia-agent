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
  const workflowRunId = session.workflowRunId;

  let galleryQuery = db.from("photo_galleries")
    .select("id,workflow_run_id,description,shoot_date,gallery_type,nas_link,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(10);
  let revisionQuery = db.from("client_revision_requests")
    .select("id,workflow_run_id,title,status,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(5);
  let reviewQuery = db.from("client_reviews")
    .select("id,workflow_run_id,overall_rating,created_at")
    .eq("client_id", clientId)
    .limit(1);
  let eventQuery = db.from("client_portal_events")
    .select("event_type,memo,created_at,workflow_run_id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(10);
  let quoteQuery = db.from("quotes")
    .select("id,workflow_run_id,quote_number,title,supply_amount,vat,total_amount,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(5);
  let contractQuery = db.from("contracts")
    .select("id,workflow_run_id,quote_number,signature_data_url,quote_data,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(5);
  let contiQuery = db.from("conti_saves")
    .select("id,workflow_run_id,title,result,saved_at")
    .eq("client_id", clientId)
    .order("saved_at", { ascending: false })
    .limit(5);

  if (workflowRunId && session.projectScoped) {
    galleryQuery = galleryQuery.eq("workflow_run_id", workflowRunId);
    revisionQuery = revisionQuery.eq("workflow_run_id", workflowRunId);
    reviewQuery = reviewQuery.eq("workflow_run_id", workflowRunId);
    eventQuery = eventQuery.eq("workflow_run_id", workflowRunId);
    quoteQuery = quoteQuery.eq("workflow_run_id", workflowRunId);
    contractQuery = contractQuery.eq("workflow_run_id", workflowRunId);
    contiQuery = contiQuery.eq("workflow_run_id", workflowRunId);
  }

  const [clientRes, galleryRes, revisionRes, reviewRes, eventsRes, perRes, workflowRes, quotesRes, contractsRes, contiRes, publicationsRes, activitiesRes, preparationRes, inquiriesRes] = await Promise.all([
    db.from("clients").select("*").eq("id", clientId).single(),
    galleryQuery,
    revisionQuery,
    reviewQuery,
    eventQuery,
    db.from("clients").select("available_points,total_earned_points,reward_tier,per_joined").eq("id", clientId).single(),
    workflowRunId
      ? db.from("workflow_runs").select("*").eq("id", workflowRunId).eq("client_id", clientId).maybeSingle()
      : db.from("workflow_runs").select("*").eq("client_id", clientId).neq("status", "canceled").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    quoteQuery,
    contractQuery,
    contiQuery,
    workflowRunId
      ? db.from("pcrm_publications").select("*").eq("client_id", clientId).eq("workflow_run_id", workflowRunId).in("status", ["published", "viewed", "revision_requested", "approved", "completed"]).order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    workflowRunId
      ? db.from("pcrm_activity_logs").select("*").eq("client_id", clientId).eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
    workflowRunId
      ? db.from("pcrm_preparation_items").select("id,status,is_required,value").eq("client_id", clientId).eq("workflow_run_id", workflowRunId).eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
    workflowRunId
      ? db.from("pcrm_inquiries").select("id,status").eq("client_id", clientId).eq("workflow_run_id", workflowRunId)
      : Promise.resolve({ data: [], error: null }),
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

  // 견적서/계약서에 PDF 다운로드 버튼을 달기 위해 연결된 workflow_artifacts를 찾아 붙인다.
  const quotes = quotesRes.data ?? [];
  const contracts = contractsRes.data ?? [];
  const { data: artifactRows } = (quotes.length || contracts.length)
    ? await db.from("workflow_artifacts")
        .select("id,source_table,source_id")
        .in("source_table", ["quotes", "contracts"])
        .in("source_id", [...quotes.map((q) => q.id), ...contracts.map((c) => c.id)])
        .eq("client_id", clientId)
        .eq("status", "ready")
    : { data: [] as any[] };
  const artifactBySourceId = new Map((artifactRows ?? []).map((row) => [row.source_id, row.id]));

  const publications = publicationsRes.data ?? [];
  const publishedSourceIds = new Set(publications.map((item) => item.related_id));
  const enforcePublication = session.projectScoped;

  return NextResponse.json({
    ok: true,
    session,
    client: clientRes.data,
    galleries: enforcePublication
      ? (galleryRes.data ?? []).filter((item) => publishedSourceIds.has(item.id))
      : galleryRes.data ?? [],
    revisions: revisionRes.data ?? [],
    hasReview: (reviewRes.data?.length ?? 0) > 0,
    events: eventsRes.data ?? [],
    per: perRes.data,
    workflowRun,
    approvedSteps,
    quotes: quotes
      .filter((item) => !enforcePublication || publishedSourceIds.has(item.id) || publishedSourceIds.has(artifactBySourceId.get(item.id)))
      .map((q) => ({ ...q, artifactId: artifactBySourceId.get(q.id) ?? null })),
    contracts: contracts
      .filter((item) => !enforcePublication || publishedSourceIds.has(item.id) || publishedSourceIds.has(artifactBySourceId.get(item.id)))
      .map((c) => ({ ...c, artifactId: artifactBySourceId.get(c.id) ?? null })),
    contiSaves: (contiRes.data ?? []).filter((item) => !enforcePublication || publishedSourceIds.has(item.id)),
    publications,
    activities: activitiesRes.data ?? [],
    collaboration: {
      preparation: preparationRes.data ?? [],
      answeredInquiryCount: (inquiriesRes.data ?? []).filter((item) => item.status === "answered").length,
      openInquiryCount: (inquiriesRes.data ?? []).filter((item) => item.status === "open").length,
    },
  });
}
