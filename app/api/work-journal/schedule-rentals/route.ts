import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToScheduleRental } from "@/lib/work-journal/scheduleSerialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("scheduleId");
  if (!scheduleId) return NextResponse.json({ ok: false, error: "scheduleId 필수" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("schedule_rentals")
    .select("*")
    .eq("schedule_id", scheduleId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rentals: (data ?? []).map(rowToScheduleRental) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body?.scheduleId || !body?.name) {
    return NextResponse.json({ ok: false, error: "scheduleId, name 필수" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { count } = await db
    .from("schedule_rentals")
    .select("id", { count: "exact", head: true })
    .eq("schedule_id", body.scheduleId);

  const { data, error } = await db
    .from("schedule_rentals")
    .insert({
      schedule_id: body.scheduleId,
      name: body.name,
      memo: body.memo ?? null,
      sort_order: count ?? 0,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rental: rowToScheduleRental(data) }, { status: 201 });
}
