import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken, logPortalEvent } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const [clientRes, txRes, settingsRes] = await Promise.all([
    db.from("clients").select("available_points,total_earned_points,total_used_points,total_donated_points,reward_tier,per_joined,per_joined_at").eq("id", session.clientId).single(),
    db.from("reward_transactions").select("id,type,points,memo,created_at").eq("client_id", session.clientId).order("created_at", { ascending: false }).limit(20),
    db.from("per_settings").select("reward_rate,point_value,point_expiration_months,policy_note").limit(1).single(),
  ]);

  await logPortalEvent({ clientId: session.clientId, eventType: "per_viewed" });

  return NextResponse.json({
    ok: true,
    per: clientRes.data,
    transactions: txRes.data ?? [],
    settings: settingsRes.data,
  });
}
