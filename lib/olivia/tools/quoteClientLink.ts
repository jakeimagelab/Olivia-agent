import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeHospitalNameLoose } from "@/lib/olivia/nameSearch";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";
import { createClientWithWorkflow } from "@/lib/clients/createClientWithWorkflow";
import { logActivity } from "@/lib/activityLogger";

export type QuoteClientCandidate = { id: string; hospital_name: string };
export type QuoteClientMatchStatus = "already_linked" | "no_match" | "match" | "ambiguous";

// 견적서 마법사 STEP 6-7(스펙 §23-29) — publish_quote가 이미 갖고 있는 발행 시점 자동
// 매칭/생성(lib/quote/quoteWorkflowLink.ts의 resolveQuoteWorkflowLink→matchClient)과는
// 별개의, 승인 직후 채팅에서 선제적으로 보여주는 카드용 검색이다. 그 자동 매칭 로직은
// 건드리지 않고 그대로 최종 안전망으로 둔다 — 이 함수는 사람이 버튼으로 직접 확인하는
// 용도라 normalizeSearchText/resolveClientId의 엄격한 안전장치를 쓰지 않고 느슨하게 찾는다.
export async function resolveQuoteClient(db: SupabaseClient, quote: Record<string, any>) {
  const resourceId = String(quote.id || "");
  if (quote.client_id) {
    return { resourceId, status: "already_linked" as QuoteClientMatchStatus, hospitalName: String(quote.hospital_name || ""), candidates: [] as QuoteClientCandidate[] };
  }
  const hospitalName = String(quote.hospital_name || "").trim();
  if (!hospitalName) {
    return { resourceId, status: "no_match" as QuoteClientMatchStatus, hospitalName: "", candidates: [] as QuoteClientCandidate[] };
  }
  const target = normalizeHospitalNameLoose(hospitalName);
  const { data } = await db.from("clients").select("id,hospital_name").limit(500);
  const candidates = ((data ?? []) as QuoteClientCandidate[]).filter((row) => {
    const candidate = normalizeHospitalNameLoose(row.hospital_name);
    return candidate && target && (candidate.includes(target) || target.includes(candidate));
  }).slice(0, 5);
  const status: QuoteClientMatchStatus = candidates.length === 0 ? "no_match" : candidates.length === 1 ? "match" : "ambiguous";
  return { resourceId, status, hospitalName, candidates };
}

// [고객 등록]/[연결] 버튼 클릭 시 실행 — clientId가 있으면 이미 확정된 후보를 그대로
// 견적에 연결(documentLink.ts의 update 패턴 재사용), 없으면 새 고객을 만든 뒤 연결한다.
export async function linkNewClientToQuote(db: SupabaseClient, input: {
  resourceId: string;
  clientId?: string | null;
  hospitalName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  const { data: quote, error: quoteError } = await db.from("quotes").select("*").eq("id", input.resourceId).maybeSingle();
  if (quoteError || !quote) throw new Error("현재 견적서를 불러오지 못했어요.");

  let client: { id: string; hospital_name: string };
  if (input.clientId) {
    const { data: existing, error: clientError } = await db.from("clients").select("id,hospital_name").eq("id", input.clientId).maybeSingle();
    if (clientError || !existing) throw new Error("고객 정보를 확인하지 못했어요.");
    client = existing;
  } else {
    const hospitalName = String(input.hospitalName || quote.hospital_name || "").trim();
    if (!hospitalName) throw new Error("고객으로 등록할 병원명을 확인하지 못했어요.");
    const created = await createClientWithWorkflow(db, {
      hospitalName,
      contactName: input.contactName ?? quote.contact_name ?? null,
      phone: input.phone ?? quote.phone ?? null,
      email: input.email ?? quote.email ?? null,
    });
    client = created.client;
  }

  const workflowRunId = await resolveWorkflowRunId(db, quote.workflow_run_id, client.id);
  const { data: updated, error } = await db.from("quotes")
    .update({ client_id: client.id, workflow_run_id: workflowRunId })
    .eq("id", input.resourceId)
    .select("*")
    .single();
  if (error || !updated) throw new Error("견적서에 고객을 연결하지 못했어요.");

  await logActivity("link_document_to_client", client.hospital_name, {
    documentType: "quote", quoteId: input.resourceId, clientId: client.id, workflowRunId, created: !input.clientId,
  });

  return { updated, client, workflowRunId };
}
