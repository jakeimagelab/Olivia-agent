import { NextRequest } from "next/server";

import { isAdminSession } from "@/lib/passkey";
import {
  photoDepartmentEvidence,
  photoFolderClientName,
  resolvePhotoDepartmentEvidence,
  type PhotoDepartmentEvidence,
} from "@/lib/photo-classifier/departmentResolver";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClientDepartmentRow = {
  id: string;
  hospital_name: string;
  specialty: string | null;
};

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const requestedClientId = params.get("clientId")?.trim() || "";
  const workflowRunId = params.get("workflowRunId")?.trim() || "";
  const folderName = params.get("folderName")?.trim() || "";
  if (!requestedClientId && !workflowRunId && !folderName) {
    return Response.json({ ok: false, error: "고객, 프로젝트 또는 폴더 정보가 필요합니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  let linkedClientId = requestedClientId;
  let linkedSource: "linked_client" | "linked_project" = "linked_client";
  const warnings: string[] = [];

  if (!linkedClientId && workflowRunId) {
    const { data, error } = await db
      .from("workflow_runs")
      .select("client_id")
      .eq("id", workflowRunId)
      .maybeSingle();
    if (error) warnings.push("연결 프로젝트의 고객 정보를 확인하지 못했습니다.");
    linkedClientId = String(data?.client_id || "");
    linkedSource = "linked_project";
  }

  const normalizedClientName = folderName ? photoFolderClientName(folderName) : "";
  const [linkedResult, matchedResult] = await Promise.all([
    linkedClientId
      ? db.from("clients").select("id,hospital_name,specialty").eq("id", linkedClientId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    normalizedClientName
      ? db.from("clients").select("id,hospital_name,specialty").eq("hospital_name", normalizedClientName).limit(2)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (linkedResult.error) warnings.push("등록 고객의 진료과를 확인하지 못했습니다.");
  if (matchedResult.error) warnings.push("폴더와 일치하는 등록 고객을 확인하지 못했습니다.");

  const evidence: PhotoDepartmentEvidence[] = [];
  const linked = linkedResult.data as ClientDepartmentRow | null;
  const linkedEvidence = photoDepartmentEvidence(linked?.specialty, linkedSource);
  if (linkedEvidence) evidence.push(linkedEvidence);

  const matchedRows = (matchedResult.data ?? []) as ClientDepartmentRow[];
  if (matchedRows.length === 1 && matchedRows[0].id !== linked?.id) {
    const matchedEvidence = photoDepartmentEvidence(matchedRows[0].specialty, "matched_client");
    if (matchedEvidence) evidence.push(matchedEvidence);
  } else if (matchedRows.length > 1) {
    warnings.push("같은 병원명의 등록 고객이 여러 명이라 폴더 고객 정보는 자동 적용하지 않았습니다.");
  }

  const folderEvidence = photoDepartmentEvidence(folderName, "folder_name");
  if (folderEvidence) evidence.push(folderEvidence);

  return Response.json({
    ok: true,
    resolution: resolvePhotoDepartmentEvidence(evidence),
    warnings,
  });
}
