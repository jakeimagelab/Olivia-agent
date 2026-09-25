import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isOptionalClientDetailColumnMissing, withClientDetailDefaults } from "@/lib/clientDetailFallback";
import { isMissingColumnError } from "@/lib/dbErrors";
import { getWorkflowPhaseProgress } from "@/lib/workflow";
import { toDisplayStatus } from "@/lib/clientWorkspace/publications";
import { computeClientWorkspaceNextAction } from "@/lib/clientWorkspace/nextAction";
import { getCoreProjectSnapshot } from "@/lib/core/readModels/projectSnapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXTENDED_CLIENT_COLUMNS = "director_name, address, website_url, instagram_url, naver_place_url, manager_staff, referral_source, notes";

type Params = { params: Promise<{ id: string }> };

// 고객 워크스페이스 통합 조회 — 3단 화면(리스트|프로젝트|공개+포털관리)이 고객을 바꿀 때마다
// 여러 API를 따로 호출하지 않고 이 엔드포인트 하나로 필요한 데이터를 다 받는다.
// 폴더명은 app/api/clients/[id]/... 기존 관례(다른 형제 라우트와 동적 세그먼트 이름이
// 같아야 함)를 따르되, 내부적으로는 읽기 쉽게 clientId로 바꿔서 쓴다.
export async function GET(req: NextRequest, { params }: Params) {
  const { id: clientId } = await params;
  const requestedProjectId = new URL(req.url).searchParams.get("projectId");
  const db = getSupabaseAdmin();

  let clientRes = await db.from("clients")
    .select(`id, hospital_name, contact_name, phone, email, specialty, memo, created_at, original_photos_link, retouched_photos_link, ${EXTENDED_CLIENT_COLUMNS}`)
    .eq("id", clientId).maybeSingle();
  if (isMissingColumnError(clientRes.error)) {
    clientRes = await db.from("clients")
      .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at, original_photos_link, retouched_photos_link")
      .eq("id", clientId).maybeSingle();
  }
  if (isOptionalClientDetailColumnMissing(clientRes.error)) {
    clientRes = await db.from("clients")
      .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at, original_photos_link, retouched_photos_link")
      .eq("id", clientId).maybeSingle();
  }
  if (clientRes.error) return NextResponse.json({ ok: false, error: clientRes.error.message }, { status: 500 });
  if (!clientRes.data) return NextResponse.json({ ok: false, error: "고객을 찾을 수 없습니다." }, { status: 404 });

  const c = withClientDetailDefaults(clientRes.data);
  const client = { ...c, name: c.hospital_name ?? "", manager_name: c.contact_name ?? "", department: c.specialty ?? "" };

  const { data: projects } = await db.from("workflow_runs")
    .select("*").eq("client_id", clientId).order("created_at", { ascending: false });
  const allProjects = projects ?? [];

  const activeProject = allProjects.find((p) => p.id === requestedProjectId)
    ?? allProjects.find((p) => p.status === "active")
    ?? allProjects[0]
    ?? null;

  let workflowSummary: any = null;
  let publications: any[] = [];
  let recentActivity: any[] = [];
  // "공개" 버튼이 어떤 자료를 공개할지 알아야 하므로, 이 프로젝트의 최신 견적/계약/콘티/셀렉갤러리
  // id를 같이 내려준다 — quote/contract는 전용 publish 라우트가, 나머지는 범용 publish 라우트가 씀.
  let resourceIds: Record<string, string | null> = { quote: null, contract: null, conti: null, select_gallery: null };
  let resourceMeta: { quote: { status: string; isApproved: boolean } | null } = { quote: null };

  if (activeProject) {
    const [snapshotResult, pubRes, activityRes] = await Promise.all([
      getCoreProjectSnapshot(activeProject.id, db),
      db.from("pcrm_publications").select("*").eq("workflow_run_id", activeProject.id).order("version", { ascending: false }),
      db.from("pcrm_activity_logs").select("*").eq("client_id", clientId).eq("workflow_run_id", activeProject.id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (!snapshotResult.ok) {
      return NextResponse.json({ ok: false, error: snapshotResult.reason, code: snapshotResult.code }, {
        status: snapshotResult.code === "PROJECT_NOT_FOUND" ? 404 : 500,
      });
    }
    const snapshot = snapshotResult.value;
    resourceIds = {
      quote: snapshot.resources.quote?.id ?? null,
      contract: snapshot.resources.contract?.id ?? null,
      conti: snapshot.resources.conti?.id ?? null,
      select_gallery: snapshot.resources.selectGallery?.id ?? null,
    };
    resourceMeta = {
      quote: snapshot.resources.quote ? {
        status: snapshot.resources.quote.status ?? "draft",
        isApproved: snapshot.resources.quote.approved,
      } : null,
    };

    const { phases } = getWorkflowPhaseProgress(snapshot.workflow.currentStep, snapshot.project.status);
    workflowSummary = {
      currentStepKey: snapshot.workflow.currentStep,
      currentStepName: snapshot.workflow.currentStepName,
      phases,
      progressPercent: snapshot.workflow.progressPercent,
      nextActionLabel: snapshot.nextAction.label,
      primaryAction: snapshot.nextAction.primaryAction,
      primaryActionLabel: snapshot.nextAction.primaryActionLabel,
    };

    // related_type별 최신 버전 한 건만 남긴다(오래된 버전은 이력용으로만 필요, 화면 카드엔 최신만).
    const latestByType = new Map<string, any>();
    for (const row of pubRes.data ?? []) {
      if (!latestByType.has(row.related_type)) latestByType.set(row.related_type, row);
    }
    publications = Array.from(latestByType.values()).map((row) => ({
      id: row.id,
      relatedType: row.related_type,
      relatedId: row.related_id,
      title: row.title,
      version: row.version,
      status: row.status,
      displayStatus: toDisplayStatus(row.status),
      publishedAt: row.published_at,
      publishedBy: row.published_by,
      revokedAt: row.revoked_at,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }));
    recentActivity = activityRes.data ?? [];
  }

  // 포털은 고객 단위 토큰(workflow_run_id가 null)을 우선 사용한다 — 없으면(마이그레이션 이전에
  // 만들어진 오래된 고객 등) 아직 프로젝트별 토큰만 있을 수 있어 그것도 보조로 조회한다.
  const { data: clientScopedPortal } = await db.from("client_portal_access")
    .select("id, access_token, created_at")
    .eq("client_id", clientId).eq("is_active", true).is("workflow_run_id", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let portalRow = clientScopedPortal;
  if (!portalRow) {
    const { data: legacyPortal } = await db.from("client_portal_access")
      .select("id, access_token, created_at")
      .eq("client_id", clientId).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    portalRow = legacyPortal ?? null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://olivia.photoclinic.kr";
  const portal = portalRow ? {
    url: `${baseUrl}/client-portal/access/${portalRow.access_token}`,
    token: portalRow.access_token,
    exposedItems: publications.filter((p) => p.displayStatus === "published").map((p) => p.relatedType),
    progressPercent: workflowSummary?.progressPercent ?? 0,
    currentStepName: workflowSummary?.currentStepName ?? null,
  } : null;

  const nextAction = computeClientWorkspaceNextAction({ activeProject, publications, clientId });

  return NextResponse.json({
    ok: true,
    client,
    projects: allProjects,
    activeProject,
    workflowSummary,
    publications,
    portal,
    recentActivity,
    resourceIds,
    resourceMeta,
    memo: activeProject?.project_memo ?? client.memo ?? "",
    nextAction,
  });
}
