import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const id     = searchParams.get("id");

  if (id) {
    const [campaign, records] = await Promise.all([
      db.from("donation_campaigns").select("*").eq("id", id).single(),
      db.from("donation_records").select("*, clients(name, manager_name)").eq("campaign_id", id).order("created_at", { ascending: false }),
    ]);
    return NextResponse.json({ ok: true, campaign: campaign.data, records: records.data ?? [] });
  }

  let query = db.from("donation_campaigns").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  const body = await req.json();
  const { title, periodLabel, startDate, endDate, donationTarget, description, goalAmount } = body;

  if (!title) return NextResponse.json({ ok: false, error: "title 필수" }, { status: 400 });

  const { data, error } = await db.from("donation_campaigns").insert({
    title, period_label: periodLabel ?? "", start_date: startDate ?? null,
    end_date: endDate ?? null, donation_target: donationTarget ?? "",
    description: description ?? "", goal_amount: goalAmount ?? 0,
    status: "draft",
  }).select("id").single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });

  const allowed = ["title","period_label","start_date","end_date","donation_target","description","goal_amount","status"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in fields) patch[k] = fields[k];

  const { error } = await db.from("donation_campaigns").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
