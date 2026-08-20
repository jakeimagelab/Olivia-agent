import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWorkflowNextAction } from "@/lib/workflowNextAction";
import { isMissingColumnError } from "@/lib/dbErrors";
import { createClientWithWorkflow } from "@/lib/clients/createClientWithWorkflow";

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
  // scope=full은 예전 응답과 100% 동일(대시보드 집계 포함) — 지금 실제로 그 집계를 그리는 화면은
  // PcrmDashboard.tsx뿐인데 그 컴포넌트는 어디서도 import되지 않는 죽은 코드다. 그래서 기본값을
  // "list"로 바꿔 고객 목록 화면(/clients, /clients/list)이 매번 기다리던 activity/inquiries/PER/
  // 오늘 일정 조회를 건너뛴다 — 필요해지면 ?scope=full로 그대로 되살릴 수 있다.
  const scope = searchParams.get("scope") === "full" ? "full" : "list";

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

  // 1단계 — 목록 화면에 항상 필요한 것만 먼저 병렬 조회(고객, 워크플로우, 포털 상태).
  let [clientsRes, runsRes, portalRes] = await Promise.all([
    query,
    supabase
      .from("workflow_runs")
      .select("id, client_id, client_name, project_name, current_step_key, status, shoot_date, updated_at, started_at, manager_name, completed_at")
      .neq("status", "canceled")
      .order("started_at", { ascending: true }),
    supabase.from("client_portal_access").select("client_id, is_active"),
  ]);

  if (isMissingColumnError(clientsRes.error)) {
    let fallbackQuery = supabase.from("clients").select(BASE_CLIENT_COLUMNS).order("created_at", { ascending: false });
    if (q) fallbackQuery = fallbackQuery.or(`hospital_name.ilike.%${q}%,contact_name.ilike.%${q}%`);
    clientsRes = (await fallbackQuery) as typeof clientsRes;
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

  // 2단계 — next_action/승인·작업 카운트(PcrmClientTable이 씀)를 위한 tasks/approvals/mailing.
  // 예전엔 전체 테이블에서 최신 300건만 가져와 그룹핑했는데, 고객이 늘수록 정작 필요한 워크플로우가
  // 300건 밖으로 밀려날 수 있는 정확성 문제도 있었다 — 실제로 존재하는 workflow_run_id로만
  // .in() 조회해서 더 가볍고 더 정확하게 바꾼다.
  const runIds = (runsRes.data ?? []).map((r) => r.id);
  const [tasksRes, approvalsRes, mailingRes] = runIds.length
    ? await Promise.all([
        supabase.from("agent_tasks").select("id, workflow_run_id, workflow_step_key, status, error_message, created_at").in("workflow_run_id", runIds),
        supabase.from("agent_approvals").select("id, workflow_run_id, workflow_step_key, status, approval_type, created_at").in("workflow_run_id", runIds),
        supabase.from("mailing_queue").select("id, workflow_run_id, workflow_step_key, hospital_name, status, created_at").order("created_at", { ascending: false }).limit(300),
      ])
    : [{ data: [] as any[], error: null }, { data: [] as any[], error: null }, { data: [] as any[], error: null }];

  // 고객마다 tasks/approvals/mailing을 매번 .filter()로 훑으면 O(고객수 × 건수)가 되어 고객이
  // 많아질수록 느려진다 — workflow_run_id 기준으로 한 번만 그룹핑해 O(1) 조회로 바꾼다.
  const groupByRunId = <T extends { workflow_run_id?: string | null }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      if (!row.workflow_run_id) continue;
      const bucket = map.get(row.workflow_run_id);
      if (bucket) bucket.push(row); else map.set(row.workflow_run_id, [row]);
    }
    return map;
  };
  const tasksByRun = groupByRunId(tasksRes.data ?? []);
  const approvalsByRun = groupByRunId(approvalsRes.data ?? []);
  const mailingRows = mailingRes.data ?? [];
  const mailingByRun = groupByRunId(mailingRows);
  const mailingByHospital = new Map<string, typeof mailingRows>();
  for (const mail of mailingRows) {
    if (mail.workflow_run_id || !mail.hospital_name) continue;
    const bucket = mailingByHospital.get(mail.hospital_name);
    if (bucket) bucket.push(mail); else mailingByHospital.set(mail.hospital_name, [mail]);
  }

  const clients = (clientsRes.data ?? []).map((c) => {
    const run = runMap[c.id] ?? null;
    const normalized = normalizeClient(c, run);
    const runTasks = run ? tasksByRun.get(run.id) ?? [] : [];
    const runApprovals = run ? approvalsByRun.get(run.id) ?? [] : [];
    const runMailing = run ? [...(mailingByRun.get(run.id) ?? []), ...(mailingByHospital.get(c.hospital_name) ?? [])] : [];
    const nextAction = run ? buildWorkflowNextAction({ run, tasks: runTasks as any, approvals: runApprovals as any, mailing: runMailing as any }) : null;
    return {
      ...normalized,
      next_action: nextAction,
      waiting_approval_count: runApprovals.filter((approval: any) => approval.status === "pending").length,
      open_task_count: runTasks.filter((task: any) => ["pending", "running", "waiting_approval", "failed"].includes(task.status)).length,
      active_project_count: activeProjectCountMap.get(c.id) ?? 0,
      portal_status: portalStatusMap.get(c.id) ?? "none",
    };
  });

  if (scope !== "full") {
    return NextResponse.json(
      { ok: true, clients, dashboard: null },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }

  // 3단계(scope=full일 때만) — 대시보드 집계용 무거운 조회. 지금은 PcrmDashboard.tsx(미사용)만
  // 이 데이터를 그리므로 기본 목록 로딩에서는 절대 안 탄다.
  const [todayTasksRes, activityRes, inquiriesRes, perClientsRes, perTxRes] = await Promise.all([
    supabase.from("calendar_tasks").select("id, title, category, time, end_time, location, completed").eq("date", todayStr).order("time", { ascending: true, nullsFirst: false }),
    supabase.from("pcrm_activity_logs").select("id, actor_type, actor_name, action_type, title, description, created_at, clients(hospital_name)").order("created_at", { ascending: false }).limit(6),
    supabase.from("pcrm_inquiries").select("id, client_id, title, status, last_message_at, clients(hospital_name)").order("last_message_at", { ascending: false }).limit(6),
    supabase.from("clients").select("available_points").eq("per_joined", true),
    supabase.from("reward_transactions").select("type, points").gte("created_at", monthStartIso),
  ]);

  /* ── 요약 카드 증감 (신규/완료 건수) ── */
  const newClientsThisWeek = (clientsRes.data ?? []).filter((c) => c.created_at >= weekAgoIso).length;
  const newActiveProjectsThisWeek = (runsRes.data ?? []).filter((r) => r.status === "active" && r.started_at >= weekAgoIso).length;
  const completedThisMonth = (runsRes.data ?? []).filter((r) => r.status === "completed" && r.completed_at && r.completed_at >= monthStartIso).length;
  const newApprovalsLast24h = (approvalsRes.data ?? []).filter((a: any) => a.status === "pending" && a.created_at >= dayAgoIso).length;
  const newTasksLast24h = (tasksRes.data ?? []).filter((t: any) => ["pending", "running", "waiting_approval", "failed"].includes(t.status) && t.created_at >= dayAgoIso).length;

  /* ── 승인 대기 항목 (유형별 집계) ── */
  const approvalTypeCounts = new Map<string, number>();
  for (const approval of approvalsRes.data ?? []) {
    if ((approval as any).status !== "pending") continue;
    const type = (approval as any).approval_type || "other";
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

    // 고객 등록 = client + 활성 workflow_run + 포털 생성(중복 방지 포함)을 한 번에 처리한다
    // — 확장 필드(director_name 등)는 이 함수가 모르는 값이라 아래에서 별도로 채운다.
    const result = await createClientWithWorkflow(supabase, {
      hospitalName: normalizedName,
      contactName: body.contact_name || body.manager_name || null,
      phone: body.phone || null,
      email: body.email || null,
      specialty: body.department || body.specialty || null,
      memo: body.memo || null,
      eventSource: "clients_api",
    });

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
    if (result.created && Object.values(extendedPayload).some(Boolean)) {
      const { error: updateError } = await supabase.from("clients").update(extendedPayload).eq("id", result.client.id);
      if (updateError && !isMissingColumnError(updateError)) throw new Error(updateError.message);
    }

    return NextResponse.json({ ok: true, id: result.client.id, workflowRunId: result.run?.id ?? null, created: result.created });
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
