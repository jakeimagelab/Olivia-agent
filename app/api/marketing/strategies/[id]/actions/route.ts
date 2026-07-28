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

    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ ok: false, error: "액션명을 입력해주세요." }, { status: 400 });
    }

    const { data: strategy, error: strategyError } = await supabase
      .from("marketing_strategies")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (strategyError) throw new Error(strategyError.message);
    if (!strategy) return NextResponse.json({ ok: false, error: "전략을 찾을 수 없습니다." }, { status: 404 });

    const payload = {
      strategy_id: id,
      title: body.title.trim(),
      description: body.description ?? "",
      scheduled_date: body.scheduledDate || null,
      related_post_url: body.relatedPostUrl ?? "",
    };

    const { data, error } = await supabase
      .from("marketing_actions")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, action: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "액션 추가 실패" }, { status: 500 });
  }
}
