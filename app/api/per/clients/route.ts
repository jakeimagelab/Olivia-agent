import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { addPoints, deductPoints, tierFromPoints } from "@/lib/per";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const q  = searchParams.get("q");
  const id = searchParams.get("id");

  if (id) {
    const { data: rawClient, error } = await db
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // 프론트가 기대하는 필드명으로 정규화 (실제 DB 컬럼: hospital_name, contact_name — app/api/clients/route.ts 참고)
    const client = { ...rawClient, name: rawClient.hospital_name, manager_name: rawClient.contact_name };

    const [txRes, orderRes, donRes] = await Promise.all([
      db.from("reward_transactions").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(50),
      db.from("reward_orders").select("*, reward_products(name, category)").eq("client_id", id).order("created_at", { ascending: false }),
      db.from("donation_records").select("*, donation_campaigns(title, period_label)").eq("client_id", id).order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      ok: true, client,
      transactions: txRes.data ?? [],
      orders:       orderRes.data ?? [],
      donations:    donRes.data ?? [],
    });
  }

  let query = db
    .from("clients")
    .select("id, name, manager_name, phone, email, reward_tier, total_paid_amount, total_earned_points, total_used_points, total_donated_points, available_points, per_joined, per_joined_at, updated_at")
    .eq("per_joined", true)
    .order("available_points", { ascending: false });

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, clients: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { clientId, action, points, amount, memo, sourceType, sourceId } = body;

  if (!clientId || !action || !points) {
    return NextResponse.json({ ok: false, error: "clientId, action, points 필수" }, { status: 400 });
  }

  try {
    if (action === "earn" || action === "adjust" || action === "cancel") {
      const txId = await addPoints(clientId, Number(points), {
        type: action, amount: amount ? Number(amount) : undefined,
        sourceType, sourceId, memo,
      });
      return NextResponse.json({ ok: true, txId });
    }
    if (action === "use" || action === "donate" || action === "expire") {
      const txId = await deductPoints(clientId, Number(points), {
        type: action, sourceType, sourceId, memo,
      });
      return NextResponse.json({ ok: true, txId });
    }
    return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필수" }, { status: 400 });

  const { data: client } = await db.from("clients").select("total_earned_points").eq("id", clientId).single();
  const tier = tierFromPoints(client?.total_earned_points ?? 0);
  await db.from("clients").update({ reward_tier: tier, per_joined: true, per_joined_at: new Date().toISOString() }).eq("id", clientId);

  return NextResponse.json({ ok: true, tier });
}
