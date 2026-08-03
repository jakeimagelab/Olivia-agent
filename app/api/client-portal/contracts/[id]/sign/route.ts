import { NextRequest } from "next/server";
import { getPortalProjectContext, pcrmError, pcrmOk, verifyPortalEntity } from "@/lib/pcrm/server";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import { applyPortalPublicationAction } from "@/lib/pcrm/publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 서명 저장 자체는 계약서 승인(approve)의 한 형태이므로, 상태 전환/자동 다음단계 이동은
// applyPortalPublicationAction()의 approve 분기(및 그 안의 자동전환 훅)를 그대로 재사용한다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPcrmUuid(id)) return pcrmError("계약서 ID가 올바르지 않습니다.");
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const { db, session } = context;

  const contract = await verifyPortalEntity(db, session, "contracts", id);
  if (!contract) return pcrmError("계약서를 찾을 수 없습니다.", 404);

  const body = await req.json().catch(() => ({} as any));
  const signatureDataUrl = typeof body.signatureDataUrl === "string" ? body.signatureDataUrl.trim() : "";
  if (!signatureDataUrl.startsWith("data:image/")) {
    return pcrmError("서명 이미지가 올바르지 않습니다.");
  }

  const { data: publication } = await db
    .from("pcrm_publications")
    .select("id")
    .eq("workflow_run_id", session.workflowRunId)
    .eq("related_type", "contract")
    .eq("related_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!publication) return pcrmError("공개된 계약서를 찾을 수 없습니다.", 404);

  const { error: contractError } = await db
    .from("contracts")
    .update({ signature_data_url: signatureDataUrl, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (contractError) return pcrmError(contractError.message, 500);

  const result = await applyPortalPublicationAction(db, session, publication.id, "approve");
  return result.ok ? pcrmOk({ publication: result.publication }) : pcrmError(result.error, result.status);
}
