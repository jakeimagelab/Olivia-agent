import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyNameSearch } from "@/lib/olivia/nameSearch";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";
import { analyzeChannels } from "@/lib/channelAnalysis";
import { executeOliviaChatWorkTool, OLIVIA_CHAT_WORK_TOOL_NAMES } from "@/lib/olivia/chatWorkTools";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text, fromLegacyResult } from "./common";
import { createVerification } from "./verification";
import { callOliviaApi } from "./http";
import { searchOliviaClients } from "@/lib/olivia/clientSearch";

const MEETING_TOOL_NAMES = [
  "list_upcoming_meetings", "prepare_meeting_brief", "analyze_meeting_memo",
  "complete_meeting", "get_meeting_followups", "link_meeting_client",
];

async function selectProject(hospitalName: string): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();
  const { data: exact, error: exactError } = await db.from("clients")
    .select("id,hospital_name")
    .eq("hospital_name", hospitalName)
    .limit(2);
  if (exactError) throw new Error("고객 정보를 확인하지 못했어요.");
  let clients = exact || [];
  if (!clients.length) {
    const { data: partial, error: partialError } = await db.from("clients")
      .select("id,hospital_name")
      .ilike("hospital_name", `%${hospitalName}%`)
      .limit(3);
    if (partialError) throw new Error("고객 정보를 확인하지 못했어요.");
    clients = partial || [];
  }
  if (!clients.length) throw new Error(`“${hospitalName}” 고객을 찾지 못했어요.`);
  if (clients.length > 1) throw new Error(`“${hospitalName}”과 비슷한 고객이 여러 명이에요. 이름을 조금 더 정확히 알려주세요.`);
  const client = clients[0];
  const { data: projects, error: projectError } = await db.from("workflow_runs")
    .select("id,project_name,status,updated_at")
    .eq("client_id", client.id)
    .order("updated_at", { ascending: false })
    .limit(2);
  if (projectError) throw new Error("프로젝트 정보를 확인하지 못했어요.");
  const active = (projects || []).find((project) => project.status === "active") || projects?.[0];
  if (!active) throw new Error(`${client.hospital_name}의 프로젝트를 찾지 못했어요.`);
  return {
    tool: "select_project",
    success: true,
    data: {
      clientId: String(client.id),
      clientName: String(client.hospital_name),
      projectId: String(active.id),
      projectName: String(active.project_name || `${client.hospital_name} 프로젝트`),
    },
    verification: createVerification({ executed: true, resourceExists: true }),
  };
}

export const CLIENT_TOOL_NAMES = [
  "client_search", "select_project", "client_get", "client_create", "client_update", "memo_add", "run_brand_diagnosis",
  ...OLIVIA_CHAT_WORK_TOOL_NAMES, ...MEETING_TOOL_NAMES,
] as const;

export async function executeClientTool(
  name: string,
  input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "client_search") {
    const found = await searchOliviaClients(text(input, "query"), { db });
    return { tool: name, success: true, data: { status: found.status, clients: found.clients }, verification: found.verification };
  }

  if (name === "client_get") {
    const clientId = text(input, "clientId") || _context.activeClientId;
    if (!clientId) throw new Error("조회할 고객 ID가 필요해요.");
    const payload = await callOliviaApi<{ ok: boolean; client: Record<string, unknown>; workflowRun?: Record<string, unknown>; resourceIds?: Record<string, unknown> }>(`/api/clients/${clientId}`);
    return { tool: name, success: true, data: { clientId, resourceId: clientId, client: payload.client, workflowRun: payload.workflowRun, resourceIds: payload.resourceIds }, verification: createVerification({ executed: true, resourceExists: true }) };
  }

  if (name === "client_create") {
    const hospitalName = text(input, "hospitalName");
    const payload = await callOliviaApi<{ ok: boolean; id: string; workflowRunId?: string; created: boolean }>("/api/clients", {
      method: "POST",
      body: JSON.stringify({
        name: hospitalName,
        contact_name: text(input, "contactName") || null,
        phone: text(input, "phone") || null,
        email: text(input, "email") || null,
        specialty: text(input, "specialty") || null,
        memo: text(input, "memo") || null,
      }),
    });
    if (!payload.id) throw new Error("고객 저장 결과에서 ID를 확인하지 못했어요.");
    const readBack = await callOliviaApi<{ ok: boolean; client: Record<string, unknown> }>(`/api/clients/${payload.id}`);
    if (readBack.client.hospital_name !== hospitalName) throw new Error("고객 저장 검증 값이 요청과 일치하지 않아요.");
    return { tool: name, success: true, data: { clientId: payload.id, resourceId: payload.id, workflowRunId: payload.workflowRunId, created: payload.created, client: readBack.client }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, linked: Boolean(payload.workflowRunId) }) };
  }

  if (name === "client_update") {
    const clientId = text(input, "clientId") || _context.activeClientId;
    if (!clientId) throw new Error("수정할 고객 ID가 필요해요.");
    const fieldMap: Record<string, string> = { hospitalName: "name", contactName: "contact_name", phone: "phone", email: "email", specialty: "specialty", memo: "memo" };
    const patch = Object.fromEntries(Object.entries(fieldMap).flatMap(([inputKey, apiKey]) => input[inputKey] === undefined ? [] : [[apiKey, input[inputKey]]]));
    if (!Object.keys(patch).length) throw new Error("변경할 고객 정보를 알려주세요.");
    await callOliviaApi<{ ok: boolean }>(`/api/clients/${clientId}`, { method: "PATCH", body: JSON.stringify(patch) });
    const readBack = await callOliviaApi<{ ok: boolean; client: Record<string, unknown> }>(`/api/clients/${clientId}`);
    for (const [key, value] of Object.entries(patch)) {
      const column = key === "name" ? "hospital_name" : key;
      if ((readBack.client[column] ?? null) !== (value || null)) throw new Error(`고객 정보 저장 검증이 일치하지 않아요: ${column}`);
    }
    return { tool: name, success: true, data: { clientId, resourceId: clientId, client: readBack.client }, verification: createVerification({ executed: true, persisted: true, resourceExists: true }) };
  }

  if (name === "select_project") return selectProject(text(input, "hospitalName"));

  // ── 병원 채널 진단 — lib/channelAnalysis.ts의 /channel-analyzer 로직을 그대로 재사용 ──
  if (name === "run_brand_diagnosis") {
    const clientName = text(input, "clientName");
    const candidates = await fuzzyNameSearch<any>({
      db, table: "clients", nameColumn: "hospital_name",
      select: "id, hospital_name, specialty, website_url, instagram_url, naver_place_url",
      query: clientName, limit: 3, throwOnError: true,
    });
    if (candidates.length > 1) throw new OliviaToolError("비슷한 고객이 여러 곳이에요. 고객을 먼저 확정해주세요.", "AMBIGUOUS", { candidates: candidates.map((item) => ({ id: item.id, name: item.hospital_name })) });
    const client = candidates[0] ?? null;
    const urls = {
      web: text(input, "websiteUrl") || client?.website_url || undefined,
      naver: text(input, "naverPlaceUrl") || client?.naver_place_url || undefined,
      insta: text(input, "instagramUrl") || client?.instagram_url || undefined,
    };
    if (!urls.web && !urls.naver && !urls.insta) {
      throw new Error(`${client?.hospital_name || clientName}의 등록된 채널 URL이 없어요. 홈페이지·네이버플레이스·인스타그램 중 하나라도 알려주세요.`);
    }
    const { result } = await analyzeChannels({ hospitalName: client?.hospital_name || clientName, specialty: client?.specialty, urls });
    return {
      tool: name,
      success: true,
      data: {
        clientId: client?.id,
        clientName: client?.hospital_name || clientName,
        overallScore: result.overall_score,
        summary: result.overall_summary,
        coverage: result.coverage_summary,
        issues: result.seo_insights,
        packageRecommendation: result.package_recommendation,
      },
    };
  }

  // ── 메모 ──
  if (name === "memo_add") {
    const clientName = text(input, "clientName");
    const clients = await fuzzyNameSearch<any>({ db, table: "clients", nameColumn: "hospital_name", select: "id, hospital_name", query: clientName, limit: 3, throwOnError: true });
    if (!clients.length) throw new OliviaToolError(`“${clientName}” 고객을 찾지 못했어요. 독립 메모가 필요하면 메모 화면에서 별도로 생성해주세요.`, "NOT_FOUND");
    if (clients.length > 1) throw new OliviaToolError("비슷한 고객이 여러 곳이에요. 메모를 연결할 고객을 확정해주세요.", "AMBIGUOUS", { candidates: clients.map((item) => ({ id: item.id, name: item.hospital_name })) });
    const client = clients[0];
    const content = text(input, "content");
    const { data: memo, error } = await db.from("consultation_memos").insert({
      hospital_id: client.id,
      raw_memo: content,
      summary: content.slice(0, 200),
      extracted_data: {},
    }).select("*").single();
    if (error || !memo) throw new Error(error?.message || "메모를 저장하지 못했어요.");
    if (!memo.id || memo.hospital_id !== client.id || memo.raw_memo !== content) throw new Error("메모 저장 검증 값이 요청과 일치하지 않아요.");
    return {
      tool: name, success: true,
      data: { memoId: memo.id, resourceId: memo.id, clientId: client.id, clientName: client.hospital_name, summary: "메모를 저장했어요." },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, linked: true }),
    };
  }

  // ── 브리핑/인사이트/검색/미팅 — 기존 chatWorkTools.ts 디스패처를 그대로 재사용 ──
  if (OLIVIA_CHAT_WORK_TOOL_NAMES.has(name) || MEETING_TOOL_NAMES.includes(name)) {
    const result = await executeOliviaChatWorkTool(db, name, input, {});
    return fromLegacyResult(name, result);
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
