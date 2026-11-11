import type { NextRequest } from "next/server";
import { deliveryAccessSummary, loadDeliveryItems } from "@/lib/person-select/deliveryServer";
import { getPublicSessionContext } from "@/lib/person-select/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const preferredRegion = ["icn1"];

export async function GET(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (ctx.event.customer_stage !== "delivery") return Response.json({ ok: false, error: "현재는 원본 사진 선택 단계입니다." }, { status: 409 });
  const db = getSupabaseAdmin();
  const items = await loadDeliveryItems(db, { eventId: ctx.event.id, personId: ctx.person.id });
  const access = deliveryAccessSummary({ owner: ctx.person, retentionDays: ctx.event.delivery_retention_days ?? 30 });
  await db.from("person_select_people").update({ last_seen_at: new Date().toISOString() }).eq("id", ctx.person.id);
  return Response.json({
    ok: true,
    event: { title: ctx.event.title, retentionDays: ctx.event.delivery_retention_days ?? 30 },
    viewer: { displayName: ctx.person.display_name, canFinalize: true },
    access,
    items,
  });
}
