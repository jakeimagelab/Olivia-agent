import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseAdmin();

  const [clients, orders, campaigns, transactions] = await Promise.all([
    db.from("clients").select("available_points, total_earned_points, total_paid_amount, total_used_points, total_donated_points, reward_tier").eq("per_joined", true),
    db.from("reward_orders").select("status").eq("status", "pending"),
    db.from("donation_campaigns").select("status").eq("status", "active"),
    db.from("reward_transactions").select("type, points, created_at, client_id").order("created_at", { ascending: false }).limit(10),
  ]);

  const cl = clients.data ?? [];
  const totalPaid     = cl.reduce((s, c) => s + (c.total_paid_amount   ?? 0), 0);
  const totalEarned   = cl.reduce((s, c) => s + (c.total_earned_points ?? 0), 0);
  const totalUsed     = cl.reduce((s, c) => s + (c.total_used_points   ?? 0), 0);
  const totalDonated  = cl.reduce((s, c) => s + (c.total_donated_points?? 0), 0);
  const totalAvailable= cl.reduce((s, c) => s + (c.available_points    ?? 0), 0);
  const vipCount      = cl.filter(c => c.reward_tier === "vip").length;

  return NextResponse.json({
    ok: true,
    summary: {
      totalPaid, totalEarned, totalUsed, totalDonated, totalAvailable,
      pendingOrders:     orders.data?.length ?? 0,
      activeCampaigns:   campaigns.data?.length ?? 0,
      vipCount,
      perClients:        cl.length,
    },
    recentTransactions: transactions.data ?? [],
  });
}
