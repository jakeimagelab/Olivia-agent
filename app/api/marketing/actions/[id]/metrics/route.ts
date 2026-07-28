import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await req.json();

    const { data: action, error: actionError } = await supabase
      .from("marketing_actions")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (actionError) throw new Error(actionError.message);
    if (!action) return NextResponse.json({ ok: false, error: "액션을 찾을 수 없습니다." }, { status: 404 });

    // modal에서 여러 지표를 한 번에 입력할 수 있어 배열(metrics)과 단일 항목(metricType 등)
    // 두 형태 모두 받는다.
    const rawEntries: any[] = Array.isArray(body.metrics) && body.metrics.length > 0
      ? body.metrics
      : [body];

    const recordedAt = body.recordedAt || new Date().toISOString().slice(0, 10);

    const rows = rawEntries
      .filter((entry) => typeof entry.metricType === "string" && entry.metricType.trim())
      .map((entry) => ({
        action_id: id,
        metric_type: entry.metricType.trim(),
        unit: entry.unit ?? "",
        value: Number(entry.value) || 0,
        recorded_at: entry.recordedAt || recordedAt,
        note: entry.note ?? "",
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "기록할 지표를 1개 이상 입력해주세요." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("marketing_metric_logs")
      .insert(rows)
      .select("*");
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, metrics: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "지표 기록 실패" }, { status: 500 });
  }
}
