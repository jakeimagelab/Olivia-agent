import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_TEMPLATE, WORKFLOW_STEPS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEW_KEYS = new Set(WORKFLOW_STEPS.map(s => s.key));

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("workflow_templates")
      .select("*, steps:workflow_steps(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!data?.length) {
      return NextResponse.json({ ok: true, mock: true, templates: [MOCK_TEMPLATE] });
    }

    // DB steps가 구 22단계이면 코드 정의 14단계로 교체
    const normalized = data.map(t => {
      const steps: any[] = t.steps ?? [];
      const hasNewKeys = steps.some(s => NEW_KEYS.has(s.step_key));
      return hasNewKeys ? t : { ...t, steps: WORKFLOW_STEPS };
    });

    return NextResponse.json({ ok: true, templates: normalized });
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
