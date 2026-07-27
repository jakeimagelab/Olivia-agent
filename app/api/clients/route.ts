import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWorkflowNextAction } from "@/lib/workflowNextAction";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import { isMissingColumnError } from "@/lib/dbErrors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── 실제 DB 컬럼: hospital_name, contact_name, phone, email, specialty, memo ── */
/* ── 확장 컬럼(2026-07-27 고객관리 개편, 마이그레이션 미적용 시 자동 폴백): director_name,
     address, website_url, instagram_url, naver_place_url, manager_staff, referral_source, notes ── */
const EXTENDED_CLIENT_COLUMNS = "director_name, address, website_url, instagram_url, naver_place_url, manager_staff, referral_source, notes";
const BASE_CLIENT_COLUMNS = "id, hospital_name, contact_name, phone, email, specialty, memo, created_at";

const APPROVAL_TYPE_LABEL: Record<string, string> = {
  quote: "견적 승인 대기",
  contract: "계약 서명 대기",
  conti: "콘티 승인 대기",
  mailing: "메일 승인 대기",
  portal_link: "포털 링크 승인 대기",
  content: "콘텐츠 승인 대기",
  per: "PER 승인 대기",
  report: "리포트 승인 대기",
  other: "기타 승인 대기",
};

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  let query = supabase
    .from("clients")
    .select(`${BASE_CLIENT_COLUMNS}, ${EXTENDED_CLIENT_COLUMNS}`)
    .order("created_at", { ascending: false });
  // 병원명/원장명/담당자명 통합 검색. 확장 컬럼(director_name)이 없는 환경일 수 있어
  // q 검색은 안전하게 hospital_name/contact_name만 우선 적용하고, director_name은 클라이언트 select 실패 시 자동으로 빠진다.
  if (q) query = query.or(`hospital_name.ilike.%${q}%,contact_name.ilike.%${q}%,director_name.ilike.%${q}%`);

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const monthStartIso = `${todayStr.slice(0, 7)}-01T00:00:00+09:00`;
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    clientsRes, runsRes, tasksRes, approvalsRes, mailingRes,
    todayTasksRes, activityRes, inquiriesRes, perClientsRes, perTxRes, portalRes,
  ] = await Promise.all([
    query,
    supabase
      .from("workflow_runs")
      .select("id, client_id, client_name, project_name, current_step_key, status, shoot_date, updated_at, started_at, manager_name, completed_at")
      .neq("status", "canceled")
      .order("started_at", { ascending: true }),
    supabase.from("agent_tasks").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("agent_approvals").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("mailing_queue").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("calendar_tasks").select("id, title, category, time, end_time, location, completed").eq("date", todayStr).order("time", { ascending: true, nullsFirst: false }),
    supabase.from("pcrm_activity_logs").select("id, actor_type, actor_name, action_type, title, description, created_at, clients(hospital_name)").order("created_at", { ascending: false }).limit(6),
    supabase.from("pcrm_inquiries").select("id, client_id, title, status, last_message_at, clients(hospital_name)").order("last_message_at", { ascending: false }).limit(6),
    supabase.from("clients").select("available_points").eq("per_joined", true),
    supabase.from("reward_transactions").select("type, points").gte("created_at", monthStartIso),
    supabase.from("client_portal_access").select("client_id, is_active"),
  ]);

  if (isMissingColumnError(clientsRes.error)) {
    let fallbackQuery = supabase.from("clients").select(BASE_CLIENT_COLUMNS).order("created_at", { ascending: false });
    if (q) fallbackQuery = fallbackQuery.or(`hospital_name.ilike.%${q}%,contact_name.ilike.%${q}%`);
    clientsRes = await fallbackQuery;
  }
  if (clientsRes.error)
    return NextResponse.json({ ok: false, error: clientsRes.error.message }, { status: 500 });

  const runMap = Object.fromEntries(
    (runsRes.data ?? []).map((r) => [r.client_id, r])
  );
  const activeProjectCountMap = new Map<string, number>();
  for (const run of runsRes.data ?? []) {
    if (run.status !== "active") continue;
    activeProjectCountMap.set(run.client_id, (activeProjectCountMap.get(run.client_id) ?? 0) + 1);
  }
  const portalStatusMap = new Map<string, "connected" | "inactive">();
  for (const access of portalRes.data ?? []) {
    if (access.is_active) portalStatusMap.set(access.client_id, "connected");
    else if (!portalStatusMap.has(access.client_id)) portalStatusMap.set(access.client_id, "inactive");
  }

  const clients = (clientsRes.data ?? []).map((c) => {
    const run = runMap[c.id] ?? null;
    const normalized = normalizeClient(c, run);
    const nextAction = run ? buildWorkflowNextAction({
      run,
      tasks: (tasksRes.data ?? []).filter((task) => task.workflow_run_id === run.id),
      approvals: (approvalsRes.data ?? []).filter((approval) => approval.workflow_run_id === run.id),
      mailing: (mailingRes.data ?? []).filter((mail) => mail.workflow_run_id === run.id || mail.hospital_name === c.hospital_name),
    }) : null;
    return {
      ...normalized,
      next_action: nextAction,
      waiting_approval_count: run
        ? (approvalsRes.data ?? []).filter((approval) => approval.workflow_run_id === run.id && approval.status === "pending").length
        : 0,
      open_task_count: run
        ? (tasksRes.data ?? []).filter((task) => task.workflow_run_id === run.id && ["pending", "running", "waiting_approval", "failed"].includes(task.status)).length
        : 0,
      active_project_count: activeProjectCountMap.get(c.id) ?? 0,
      portal_status: portalStatusMap.get(c.id) ?? "none",
    };
  });

  /* ── 요약 카드 증감 (신규/완료 건수) ── */
  const newClientsThisWeek = (clientsRes.data ?? []).filter((c) => c.created_at >= weekAgoIso).length;
  const newActiveProjectsThisWeek = (runsRes.data ?? []).filter((r) => r.status === "active" && r.started_at >= weekAgoIso).length;
  const completedThisMonth = (runsRes.data ?? []).filter((r) => r.status === "completed" && r.completed_at && r.completed_at >= monthStartIso).length;
  const newApprovalsLast24h = (approvalsRes.data ?? []).filter((a) => a.status === "pending" && a.created_at >= dayAgoIso).length;
  const newTasksLast24h = (tasksRes.data ?? []).filter((t) => ["pending", "running", "waiting_approval", "failed"].includes(t.status) && t.created_at >= dayAgoIso).length;

  /* ── 승인 대기 항목 (유형별 집계) ── */
  const approvalTypeCounts = new Map<string, number>();
  for (const approval of approvalsRes.data ?? []) {
    if (approval.status !== "pending") continue;
    const type = approval.approval_type || "other";
    approvalTypeCounts.set(type, (approvalTypeCounts.get(type) ?? 0) + 1);
  }
  const pendingApprovalsByType = Array.from(approvalTypeCounts.entries())
    .map(([type, count]) => ({ type, label: APPROVAL_TYPE_LABEL[type] || `${type} 승인 대기`, count }))
    .sort((a, b) => b.count - a.count);

  /* ── 최근 문의/메시지 (전체 고객, 최근 메시지 본문 포함) ── */
  const inquiries = inquiriesRes.data ?? [];
  const inquiryIds = inquiries.map((item: any) => item.id);
  const { data: latestMessages } = inquiryIds.length
    ? await supabase.from("pcrm_inquiry_messages").select("inquiry_id, content, created_at").in("inquiry_id", inquiryIds).order("created_at", { ascending: false })
    : { data: [] as any[] };
  const latestMessageByInquiry = new Map<string, string>();
  for (const message of latestMessages ?? []) {
    if (!latestMessageByInquiry.has(message.inquiry_id)) latestMessageByInquiry.set(message.inquiry_id, message.content);
  }
  const recentInquiries = inquiries.map((item: any) => ({
    id: item.id,
    clientId: item.client_id,
    clientName: item.clients?.hospital_name || "",
    title: item.title,
    status: item.status,
    preview: latestMessageByInquiry.get(item.id) || item.title,
    lastMessageAt: item.last_message_at,
  }));

  /* ── 최근 활동 (전체 고객) ── */
  const recentActivity = (activityRes.data ?? []).map((item: any) => ({
    id: item.id,
    clientName: item.clients?.hospital_name || "",
    actionType: item.action_type,
    title: item.title,
    createdAt: item.created_at,
  }));

  /* ── PER 포인트 현황 ── */
  const perPoints = {
    available: (perClientsRes.data ?? []).reduce((sum, c: any) => sum + (c.available_points ?? 0), 0),
    earnedThisMonth: (perTxRes.data ?? []).filter((t: any) => t.type === "earn").reduce((sum, t: any) => sum + (t.points ?? 0), 0),
    usedThisMonth: (perTxRes.data ?? []).filter((t: any) => t.type === "use").reduce((sum, t: any) => sum + (t.points ?? 0), 0),
  };

  return NextResponse.json(
    {
      ok: true,
      clients,
      dashboard: {
        newClientsThisWeek,
        newActiveProjectsThisWeek,
        completedThisMonth,
        newApprovalsLast24h,
        newTasksLast24h,
        pendingApprovalsByType,
        todaySchedule: todayTasksRes.data ?? [],
        recentActivity,
        recentInquiries,
        perPoints,
      },
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const hospitalName = body.name || body.hospital_name;
  if (!hospitalName) return NextResponse.json({ ok: false, error: "병원명 필수" }, { status: 400 });

  try {
    const normalizedName = String(hospitalName).trim();
    const { data: existing } = await supabase
      .from("clients")
      .select("id,hospital_name")
      .ilike("hospital_name", normalizedName)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, workflowRunId: null, created: false });
    }

    const basePayload = {
      hospital_name: normalizedName,
      contact_name: body.contact_name || body.manager_name || null,
      phone: body.phone || null,
      email: body.email || null,
      specialty: body.department || body.specialty || null,
      memo: body.memo || null,
    };
    const extendedPayload = {
      director_name: body.director_name || null,
      address: body.address || null,
      website_url: body.website_url || null,
      instagram_url: body.instagram_url || null,
      naver_place_url: body.naver_place_url || null,
      manager_staff: body.manager_staff || null,
      referral_source: body.referral_source || null,
      notes: body.notes || null,
    };

    let { data: client, error } = await supabase.from("clients").insert({ ...basePayload, ...extendedPayload }).select("id,hospital_name").single();
    if (isMissingColumnError(error)) {
      ({ data: client, error } = await supabase.from("clients").insert(basePayload).select("id,hospital_name").single());
    }
    if (error || !client) throw new Error(error?.message || "고객 등록 실패");

    await emitOliviaEventSafely(supabase, {
      eventType: "customer.created",
      eventSource: "clients_api",
      clientId: client.id,
      actorType: "admin",
      payload: {
        name: normalizedName,
        managerName: body.director_name || body.contact_name || body.manager_name || "",
        department: body.department || body.specialty || "",
      },
      deduplicationKey: createEventDeduplicationKey("customer.created", client.id),
    });

    return NextResponse.json({ ok: true, id: client.id, workflowRunId: null, created: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "고객 등록 실패" }, { status: 500 });
  }
}

/* 프론트가 기대하는 필드명으로 정규화 */
function normalizeClient(c: Record<string, unknown>, activeRun: unknown) {
  return {
    ...c,
    name:         c.hospital_name ?? "",
    manager_name: c.contact_name  ?? "",
    department:   c.specialty     ?? "",
    active_run:   activeRun,
  };
}
