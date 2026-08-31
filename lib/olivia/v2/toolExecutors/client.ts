import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { analyzeChannels } from "@/lib/channelAnalysis";
import { executeOliviaChatWorkTool, OLIVIA_CHAT_WORK_TOOL_NAMES } from "@/lib/olivia/chatWorkTools";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text, fromLegacyResult } from "./common";
import { createVerification } from "./verification";

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
  "select_project", "memo_add", "run_brand_diagnosis",
  ...OLIVIA_CHAT_WORK_TOOL_NAMES, ...MEETING_TOOL_NAMES,
] as const;

export async function executeClientTool(
  name: string,
  input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "select_project") return selectProject(text(input, "hospitalName"));

  // ── 병원 채널 진단 — lib/channelAnalysis.ts의 /channel-analyzer 로직을 그대로 재사용 ──
  if (name === "run_brand_diagnosis") {
    const clientName = text(input, "clientName");
    const client = await fuzzyNameSearchOne<any>({
      db, table: "clients", nameColumn: "hospital_name",
      select: "id, hospital_name, specialty, website_url, instagram_url, naver_place_url",
      query: clientName,
    });
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
    const client = await fuzzyNameSearchOne<any>({ db, table: "clients", nameColumn: "hospital_name", select: "id, hospital_name", query: text(input, "clientName") });
    await db.from("consultation_memos").insert({
      hospital_id: client?.id ?? null,
      raw_memo: text(input, "content"),
      summary: text(input, "content").slice(0, 200),
      extracted_data: {},
    });
    return {
      tool: name, success: true,
      data: { clientName: client?.hospital_name || text(input, "clientName"), summary: "메모를 저장했어요." },
      verification: createVerification({ executed: true, persisted: true }),
    };
  }

  // ── 브리핑/인사이트/검색/미팅 — 기존 chatWorkTools.ts 디스패처를 그대로 재사용 ──
  if (OLIVIA_CHAT_WORK_TOOL_NAMES.has(name) || MEETING_TOOL_NAMES.includes(name)) {
    const result = await executeOliviaChatWorkTool(db, name, input, {});
    return fromLegacyResult(name, result);
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
