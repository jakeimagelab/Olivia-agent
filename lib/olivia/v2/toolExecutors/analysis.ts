import { searchOliviaClients } from "@/lib/olivia/clientSearch";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { callOliviaApi } from "./http";
import { text } from "./common";
import { createVerification } from "./verification";

export const ANALYSIS_TOOL_NAMES = [
  "trend_analysis_run", "trend_analysis_get_latest", "trend_analysis_preview",
  "brand_analysis_run", "brand_analysis_get_latest", "brand_analysis_preview",
] as const;

async function getClient(clientId: string) {
  const payload = await callOliviaApi<{ ok: boolean; client: Record<string, unknown> }>(`/api/clients/${clientId}`);
  return payload.client;
}

async function resolveClient(input: Record<string, unknown>, context: OliviaContextSnapshot) {
  let clientId = text(input, "clientId") || context.activeClientId;
  if (!clientId) {
    const name = text(input, "hospitalName") || context.activeClientName;
    if (!name) throw new Error("분석할 고객을 먼저 알려주세요.");
    const found = await searchOliviaClients(name);
    if (found.clients.length !== 1) throw new Error(found.clients.length ? "비슷한 고객이 여러 곳이에요. 고객을 먼저 확정해주세요." : "등록된 고객을 찾지 못했어요.");
    clientId = found.clients[0].id;
  }
  return { clientId, client: await getClient(clientId) };
}

async function loadBrandAnalysis(id: string) {
  return callOliviaApi<{ ok: boolean; diagnosis: Record<string, unknown>; sources: unknown[]; channelResults: unknown[]; evidence: unknown[] }>(`/api/hospital-brand-diagnosis/${id}`);
}

export async function executeAnalysisTool(name: string, input: Record<string, unknown>, context: OliviaContextSnapshot): Promise<OliviaToolResult> {
  if (name === "trend_analysis_run") {
    const industry = text(input, "industry") || "all";
    const payload = await callOliviaApi<{ ok: boolean; insight: Record<string, unknown> }>("/api/trend/insight", { method: "POST", body: JSON.stringify({ industry }) });
    const id = String(payload.insight?.id || "");
    if (!id) throw new Error("트렌드 분석 저장 결과에서 ID를 확인하지 못했어요.");
    const latest = await callOliviaApi<{ latestInsight?: Record<string, unknown> }>(`/api/trend/dashboard?industry=${encodeURIComponent(industry)}`);
    if (latest.latestInsight?.id !== id) throw new Error("트렌드 분석 결과를 다시 확인하지 못했어요.");
    return { tool: name, success: true, data: { resourceType: "trend_analysis", resourceId: id, insight: latest.latestInsight, summary: latest.latestInsight.summary }, verification: createVerification({ executed: true, persisted: true, resourceExists: true }) };
  }

  if (name === "trend_analysis_get_latest" || name === "trend_analysis_preview") {
    const industry = text(input, "industry") || "all";
    const payload = await callOliviaApi<{ latestInsight?: Record<string, unknown> }>(`/api/trend/dashboard?industry=${encodeURIComponent(industry)}`);
    if (!payload.latestInsight) throw new Error("저장된 트렌드 분석을 찾지 못했어요.");
    return { tool: name, success: true, data: { resourceType: "trend_analysis", resourceId: payload.latestInsight.id, insight: payload.latestInsight }, verification: createVerification({ executed: true, resourceExists: true }) };
  }

  if (name === "brand_analysis_run") {
    const { clientId, client } = await resolveClient(input, context);
    const hospitalName = String(client.hospital_name || client.name || "");
    const specialty = text(input, "specialty") || String(client.specialty || client.department || "");
    if (!specialty) throw new Error("브랜드 분석을 위해 고객의 진료과를 알려주세요.");
    const channels = [
      { channel: "website", url: text(input, "websiteUrl") || String(client.website_url || "") },
      { channel: "naver_place", url: text(input, "naverPlaceUrl") || String(client.naver_place_url || "") },
      { channel: "instagram", url: text(input, "instagramUrl") || String(client.instagram_url || "") },
    ].filter((entry) => entry.url);
    if (!channels.length) throw new Error("분석할 채널 URL이 없어요. 홈페이지·네이버플레이스·인스타그램 중 하나를 알려주세요.");
    // Validate all required inputs before creating the canonical resource so a
    // rejected MCP call cannot leave an orphaned diagnosis row behind.
    const created = await callOliviaApi<{ ok: boolean; id: string }>("/api/hospital-brand-diagnosis/create", { method: "POST", body: JSON.stringify({ clientId, hospitalName, specialty }) });
    await callOliviaApi<{ ok: boolean }>(`/api/hospital-brand-diagnosis/${created.id}`, { method: "PATCH", body: JSON.stringify({ channels }) });
    await callOliviaApi<{ ok: boolean }>("/api/hospital-brand-diagnosis/collect", { method: "POST", body: JSON.stringify({ diagnosisId: created.id }) });
    const analyzed = await callOliviaApi<{ ok: boolean; hasErrors?: boolean; failedChannels?: string[] }>("/api/hospital-brand-diagnosis/analyze-channel", { method: "POST", body: JSON.stringify({ diagnosisId: created.id }) });
    if (analyzed.hasErrors) throw new Error(`일부 브랜드 채널 분석에 실패했어요: ${(analyzed.failedChannels || []).join(", ")}`);
    const compiled = await callOliviaApi<{ ok: boolean; report: Record<string, unknown> }>("/api/hospital-brand-diagnosis/compile", { method: "POST", body: JSON.stringify({ diagnosisId: created.id }) });
    const readBack = await loadBrandAnalysis(created.id);
    if (readBack.diagnosis.status !== "completed" || !readBack.diagnosis.report_json) throw new Error("브랜드 분석 결과가 완료 상태로 저장되지 않았어요.");
    return { tool: name, success: true, data: { resourceType: "brand_analysis", resourceId: created.id, clientId, summary: compiled.report.overallSummary, report: readBack.diagnosis.report_json }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, linked: true, details: { status: "completed" } }) };
  }

  if (name === "brand_analysis_get_latest") {
    const { clientId } = await resolveClient(input, context);
    const list = await callOliviaApi<{ ok: boolean; diagnoses: Array<Record<string, unknown>> }>("/api/hospital-brand-diagnosis/create?limit=50");
    for (const candidate of list.diagnoses) {
      const detail = await loadBrandAnalysis(String(candidate.id));
      if (detail.diagnosis.client_id === clientId && detail.diagnosis.status === "completed") {
        return { tool: name, success: true, data: { resourceType: "brand_analysis", resourceId: candidate.id, report: detail.diagnosis.report_json }, verification: createVerification({ executed: true, resourceExists: true, linked: true }) };
      }
    }
    throw new Error("이 고객의 완료된 브랜드 분석을 찾지 못했어요.");
  }

  if (name === "brand_analysis_preview") {
    const id = text(input, "resourceId") || context.activeResourceId;
    if (!id) throw new Error("미리 볼 브랜드 분석 ID가 필요해요.");
    const detail = await loadBrandAnalysis(id);
    return { tool: name, success: true, data: { resourceType: "brand_analysis", resourceId: id, report: detail.diagnosis.report_json, diagnosis: detail.diagnosis }, verification: createVerification({ executed: true, resourceExists: true }) };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
