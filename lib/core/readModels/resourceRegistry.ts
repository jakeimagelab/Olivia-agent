import type { SupabaseClient } from "@supabase/supabase-js";
import { selectWorkspaceQuote } from "@/lib/clientWorkspace/quoteSelection";
import type { CoreResourceRegistry } from "./types";

function assertQuerySucceeded(result: { error: { message?: string } | null }, resource: string) {
  if (result.error) throw new Error(`${resource} 조회 실패: ${result.error.message || "데이터베이스 오류"}`);
}

export async function loadCoreResourceRegistry(
  db: SupabaseClient,
  workflowRunId: string,
): Promise<CoreResourceRegistry> {
  const [approvedQuoteRes, latestQuoteRes, contractRes, contiRunRes, legacyContiRes, photoProjectRes, selectGalleryRes, photoGalleryRes] = await Promise.all([
    db.from("quotes")
      .select("id,status,title,hospital_name,client_id,workflow_run_id,created_at,updated_at")
      .eq("workflow_run_id", workflowRunId)
      .in("status", ["published", "final"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("quotes")
      .select("id,status,title,hospital_name,client_id,workflow_run_id,created_at,updated_at")
      .eq("workflow_run_id", workflowRunId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("contracts")
      .select("id,status,client_id,workflow_run_id,source_quote_id,created_at,updated_at,hospital_name")
      .eq("workflow_run_id", workflowRunId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("conti_runs")
      .select("id,hospital_id,workflow_run_id,hospital_name,created_at,updated_at")
      .eq("workflow_run_id", workflowRunId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("conti_saves")
      .select("id,client_id,workflow_run_id,hospital_name,title,saved_at")
      .eq("workflow_run_id", workflowRunId)
      .order("saved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("photo_storage_projects")
      .select("id,workflow_run_id,project_name,status,created_at,updated_at")
      .eq("workflow_run_id", workflowRunId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("select_galleries")
      .select("id,client_id,workflow_run_id,title,status,created_at,updated_at")
      .eq("workflow_run_id", workflowRunId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("photo_galleries")
      .select("id,client_id,workflow_run_id,hospital_name,description,gallery_type,created_at")
      .eq("workflow_run_id", workflowRunId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  [
    [approvedQuoteRes, "확정 견적서"],
    [latestQuoteRes, "최신 견적서"],
    [contractRes, "계약서"],
    [contiRunRes, "콘티"],
    [legacyContiRes, "이전 콘티"],
    [photoProjectRes, "사진 프로젝트"],
    [selectGalleryRes, "셀렉 갤러리"],
    [photoGalleryRes, "사진 갤러리"],
  ].forEach(([result, label]) => assertQuerySucceeded(
    result as { error: { message?: string } | null },
    String(label),
  ));

  const quoteSelection = selectWorkspaceQuote(approvedQuoteRes.data, latestQuoteRes.data);
  const quoteRow = quoteSelection.quote as typeof latestQuoteRes.data;
  const contract = contractRes.data;
  const contiRun = contiRunRes.data;
  const legacyConti = legacyContiRes.data;
  const photoProject = photoProjectRes.data;
  const selectGallery = selectGalleryRes.data;
  const photoGallery = photoGalleryRes.data;

  return {
    quote: quoteRow ? {
      type: "quote",
      id: quoteRow.id,
      status: quoteRow.status,
      title: quoteRow.title || quoteRow.hospital_name || null,
      clientId: quoteRow.client_id,
      workflowRunId: quoteRow.workflow_run_id,
      sourceTable: "quotes",
      createdAt: quoteRow.created_at,
      updatedAt: quoteRow.updated_at,
      approved: quoteSelection.meta?.isApproved ?? false,
    } : null,
    contract: contract ? {
      type: "contract",
      id: contract.id,
      status: contract.status,
      title: contract.hospital_name || null,
      clientId: contract.client_id,
      workflowRunId: contract.workflow_run_id,
      sourceTable: "contracts",
      sourceQuoteId: contract.source_quote_id,
      createdAt: contract.created_at,
      updatedAt: contract.updated_at,
    } : null,
    conti: contiRun ? {
      type: "conti",
      id: contiRun.id,
      title: contiRun.hospital_name || null,
      clientId: contiRun.hospital_id,
      workflowRunId: contiRun.workflow_run_id,
      sourceTable: "conti_runs",
      createdAt: contiRun.created_at,
      updatedAt: contiRun.updated_at,
    } : legacyConti ? {
      type: "conti",
      id: legacyConti.id,
      title: legacyConti.title || legacyConti.hospital_name || null,
      clientId: legacyConti.client_id,
      workflowRunId: legacyConti.workflow_run_id,
      sourceTable: "conti_saves",
      createdAt: legacyConti.saved_at,
      updatedAt: legacyConti.saved_at,
    } : null,
    photoProject: photoProject ? {
      type: "photo_project",
      id: photoProject.id,
      status: photoProject.status,
      title: photoProject.project_name,
      clientId: null,
      workflowRunId: photoProject.workflow_run_id,
      sourceTable: "photo_storage_projects",
      createdAt: photoProject.created_at,
      updatedAt: photoProject.updated_at,
    } : null,
    selectGallery: selectGallery ? {
      type: "select_gallery",
      id: selectGallery.id,
      status: selectGallery.status,
      title: selectGallery.title,
      clientId: selectGallery.client_id,
      workflowRunId: selectGallery.workflow_run_id,
      sourceTable: "select_galleries",
      createdAt: selectGallery.created_at,
      updatedAt: selectGallery.updated_at,
    } : null,
    photoGallery: photoGallery ? {
      type: "photo_gallery",
      id: photoGallery.id,
      status: photoGallery.gallery_type,
      title: photoGallery.description || photoGallery.hospital_name || null,
      clientId: photoGallery.client_id,
      workflowRunId: photoGallery.workflow_run_id,
      sourceTable: "photo_galleries",
      createdAt: photoGallery.created_at,
      updatedAt: photoGallery.created_at,
    } : null,
  };
}
