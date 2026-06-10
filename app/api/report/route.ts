import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "week"; // week | month | all

  const now = new Date();
  let fromDate: Date;
  if (period === "month") fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  else if (period === "all")  fromDate = new Date("2024-01-01");
  else                        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const admin = getSupabaseAdmin();

  const { data: logs } = await admin
    .from("activity_logs")
    .select("*")
    .gte("created_at", fromDate.toISOString())
    .order("created_at", { ascending: false });

  // 집계
  const counts: Record<string, number> = {};
  const hospitalMap: Record<string, number> = {};
  const daily: Record<string, number> = {};

  (logs || []).forEach((log: any) => {
    counts[log.action_type] = (counts[log.action_type] || 0) + 1;
    if (log.hospital_name) {
      hospitalMap[log.hospital_name] = (hospitalMap[log.hospital_name] || 0) + 1;
    }
    const day = log.created_at?.slice(0, 10);
    if (day) daily[day] = (daily[day] || 0) + 1;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // 최근 10개 활동
  const recent = (logs || []).slice(0, 10).map((log: any) => ({
    type: log.action_type,
    hospital: log.hospital_name,
    time: log.created_at,
    details: log.details,
  }));

  // 병원 랭킹
  const hospitalRanking = Object.entries(hospitalMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // 일별 차트 (최근 7일)
  const chartDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    chartDays.push(d.toISOString().slice(0, 10));
  }
  const chartData = chartDays.map(d => ({ date: d, count: daily[d] || 0 }));

  return NextResponse.json({ ok: true, total, counts, recent, hospitalRanking, chartData, period });
}
