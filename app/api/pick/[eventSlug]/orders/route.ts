import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { eventIsLocked, validateOrderItems } from "@/lib/person-select/core";
import { getPublicSessionContext } from "@/lib/person-select/server";

export const preferredRegion = ["icn1"];

/** 고객의 추가 주문(액자·앨범 등)을 통째로 저장한다. 추가 보정은 고른 장수로 자동 계산되므로 여기 담지 않는다. */
export async function PUT(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (eventIsLocked(ctx.event)) return Response.json({ ok: false, error: "선택이 마감됐어요." }, { status: 423 });
  const body = await request.json().catch(() => ({})) as { items?: unknown };
  const db = getSupabaseAdmin();
  const { data: choices } = await db.from("person_select_choices").select("image_id").eq("person_id", ctx.person.id).eq("event_id", ctx.event.id);
  const checked = validateOrderItems(body.items, ctx.event.offers ?? [], new Set((choices ?? []).map((choice) => choice.image_id as string)));
  if ("error" in checked) return Response.json({ ok: false, error: checked.error }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await db.from("person_select_people").update({ orders: checked.items, orders_updated_at: now, submitted_at: null, last_seen_at: now, updated_at: now }).eq("id", ctx.person.id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, items: checked.items });
}
