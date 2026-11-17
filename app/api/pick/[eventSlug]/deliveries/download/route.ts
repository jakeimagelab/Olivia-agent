import type { NextRequest } from "next/server";

import { createDeliveryNasDownloadJob, DeliveryNasDownloadUnavailableError, readDeliveryNasDownloadJob } from "@/lib/person-select/deliveryNasDownload";
import { deliveryAccessSummary } from "@/lib/person-select/deliveryServer";
import { getPublicSessionContext } from "@/lib/person-select/server";
import { enforcePublicSelectionRateLimit, PublicSelectionRequestError, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function contextFor(request: NextRequest, eventSlug: string) {
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) throw new PublicSelectionRequestError("다시 로그인해 주세요.", 401);
  const access = deliveryAccessSummary({ owner: ctx.person, retentionDays: ctx.event.delivery_retention_days ?? 30 });
  if (!access.downloadAvailable) throw new PublicSelectionRequestError(access.expired ? "보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요." : "최종 확인 후 다운로드할 수 있습니다.", 403);
  return ctx;
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  try {
    const ctx = await contextFor(request, eventSlug);
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: `delivery-nas:${ctx.person.id}`, action: "person-delivery-nas", limit: 12, windowSeconds: 300, identityOnly: true });
    const job = await createDeliveryNasDownloadJob(db, { eventId: ctx.event.id, personId: ctx.person.id, title: ctx.event.title });
    return Response.json({ ok: true, job });
  } catch (error) {
    if (error instanceof DeliveryNasDownloadUnavailableError) return Response.json({ ok: false, error: error.message }, { status: 503 });
    return publicSelectionErrorResponse(error);
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  try {
    const ctx = await contextFor(request, eventSlug);
    const jobId = request.nextUrl.searchParams.get("jobId")?.trim();
    if (!jobId) return Response.json({ ok: false, error: "다운로드 작업 ID가 필요합니다." }, { status: 400 });
    const db = getSupabaseAdmin();
    const job = await readDeliveryNasDownloadJob(db, { eventId: ctx.event.id, personId: ctx.person.id, title: ctx.event.title }, jobId);
    if (job.status === "COMPLETED" && !ctx.person.delivery_downloaded_at) {
      const now = new Date().toISOString();
      await db.from("person_select_people").update({ delivery_downloaded_at: now, updated_at: now }).eq("id", ctx.person.id);
    }
    return Response.json({ ok: true, job });
  } catch (error) {
    if (error instanceof DeliveryNasDownloadUnavailableError) return Response.json({ ok: false, error: error.message }, { status: 503 });
    return publicSelectionErrorResponse(error);
  }
}
