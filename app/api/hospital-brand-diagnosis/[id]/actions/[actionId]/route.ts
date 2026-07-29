import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/hospitalBrandDiagnosis/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATUSES = ["todo", "in_progress", "completed", "deferred"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  try {
    const { id, actionId } = await params;
    if (!isUuid(id) || !isUuid(actionId)) {
      return NextResponse.json({ ok: false, error: "요청 값이 올바르지 않습니다." }, { status: 400 });
    }
    const body = await req.json();
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ ok: false, error: "status 값이 올바르지 않습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: findError } = await supabase
      .from("hospital_brand_diagnosis_actions").select("id, diagnosis_id").eq("id", actionId).maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!existing || existing.diagnosis_id !== id) {
      return NextResponse.json({ ok: false, error: "개선 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const patch: Record<string, unknown> = { status: body.status };
    patch.completed_at = body.status === "completed" ? new Date().toISOString() : null;

    const { error } = await supabase.from("hospital_brand_diagnosis_actions").update(patch).eq("id", actionId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "개선 항목 수정 실패" }, { status: 500 });
  }
}
