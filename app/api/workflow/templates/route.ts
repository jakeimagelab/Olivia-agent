import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ACTIVE_WORKFLOW_STEPS, MOCK_TEMPLATE } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    // steps는 JOIN하지 않고 template 메타데이터만 읽음
    // 신규 실행 단계 정의는 코드(ACTIVE_WORKFLOW_STEPS)가 단일 소스
    const { data, error } = await db
      .from("workflow_templates")
      .select("id, name, description, type, is_active, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!data?.length) {
      return NextResponse.json({ ok: true, mock: true, templates: [MOCK_TEMPLATE] });
    }

    const templates = data.map(t => ({ ...t, steps: ACTIVE_WORKFLOW_STEPS }));
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    return NextResponse.json({ ok: true, mock: true, note: error instanceof Error ? error.message : String(error), templates: [MOCK_TEMPLATE] });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("workflow_templates")
    .insert({
      name: body.name,
      description: body.description ?? "",
      type: body.type ?? "custom",
      is_active: body.is_active ?? true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}
