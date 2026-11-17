import type { NextRequest } from "next/server";

import { createDeliveryNasDownloadJob, DeliveryNasDownloadUnavailableError, readDeliveryNasDownloadJob } from "@/lib/person-select/deliveryNasDownload";
import { deliveryAccessSummary } from "@/lib/person-select/deliveryServer";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { enforcePublicSelectionRateLimit, PublicSelectionRequestError, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function contextFor(shareToken: string) {
  const db = getSupabaseAdmin();
  const access = await resolveSharedPersonSelectAccess(db, shareToken, { touch: true });
  if (access.event.customer_stage !== "delivery") throw new PublicSelectionRequestError("현재는 보정본 확인 단계가 아닙니다.", 409);
  const summary = deliveryAccessSummary({ owner: access.event, retentionDays: access.event.delivery_retention_days ?? 30 });
  if (!summary.downloadAvailable) throw new PublicSelectionRequestError(summary.expired ? "보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요." : "최종 확인 후 다운로드할 수 있습니다.", 403);
  return { db, ...access };
}

export async function POST(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const { db, event, reviewer } = await contextFor(shareToken);
    await enforcePublicSelectionRateLimit({ db, request, token: `delivery-nas:${reviewer.id}`, action: "person-shared-delivery-nas", limit: 12, windowSeconds: 300, identityOnly: true });
    const job = await createDeliveryNasDownloadJob(db, { eventId: event.id, title: event.title });
    return Response.json({ ok: true, job });
  } catch (error) {
    if (error instanceof DeliveryNasDownloadUnavailableError) return Response.json({ ok: false, error: error.message }, { status: 503 });
    return publicSelectionErrorResponse(error);
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const { db, event } = await contextFor(shareToken);
    const jobId = request.nextUrl.searchParams.get("jobId")?.trim();
    if (!jobId) return Response.json({ ok: false, error: "다운로드 작업 ID가 필요합니다." }, { status: 400 });
    const job = await readDeliveryNasDownloadJob(db, { eventId: event.id, title: event.title }, jobId);
    if (job.status === "COMPLETED" && !event.delivery_downloaded_at) {
      const now = new Date().toISOString();
      await db.from("person_select_events").update({ delivery_downloaded_at: now, updated_at: now }).eq("id", event.id);
    }
    return Response.json({ ok: true, job });
  } catch (error) {
    if (error instanceof DeliveryNasDownloadUnavailableError) return Response.json({ ok: false, error: error.message }, { status: 503 });
    return publicSelectionErrorResponse(error);
  }
}
