import { NextRequest } from "next/server";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import { applyPortalPublicationAction } from "@/lib/pcrm/publications";
import { validateShortText } from "@/lib/pcrm/collaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPcrmUuid(id)) return pcrmError("공개 항목 ID가 올바르지 않습니다.");
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const body = await req.json().catch(() => null);
  const validated = validateShortText(body?.feedback, "수정 요청 내용", 2000);
  if (!validated.ok) return pcrmError(validated.error);
  const result = await applyPortalPublicationAction(context.db, context.session, id, "request_revision", validated.value);
  return result.ok ? pcrmOk({ publication: result.publication }) : pcrmError(result.error, result.status);
}
