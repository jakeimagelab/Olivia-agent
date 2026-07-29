import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { escapeText, isUuid, isValidChannel } from "@/lib/hospitalBrandDiagnosis/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 섹션 15-2: "바로 수정할 수 있는 항목"의 진행 상태(미완료/진행중/완료/보류)를 서버에 저장한다.
// GET — 목록 조회. POST — 리포트 컴파일 직후 클라이언트가 즉시수정항목들을 1회 시딩할 때 사용한다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("hospital_brand_diagnosis_actions")
      .select("*")
      .eq("diagnosis_id", id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, actions: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "개선 항목 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });

    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return NextResponse.json({ ok: false, error: "items가 필요합니다." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("hospital_brand_diagnosis_actions").select("title, channel").eq("diagnosis_id", id);
    if (existingError) throw new Error(existingError.message);
    const existingKeys = new Set((existing ?? []).map((a) => `${a.channel ?? ""}::${a.title}`));

    // 우선순위는 AI가 임의로 정하지 않는다 — "즉시 수정 가능한 항목"이라는 정의 자체가
    // 즉시 수정 가능 여부 기준을 이미 충족하므로 규칙적으로 high로 시작한다.
    const rows = items
      .map((item: any) => ({
        diagnosis_id: id,
        channel: isValidChannel(item.channel) ? item.channel : null,
        title: escapeText(item.title, 400),
        description: escapeText(item.description, 2000),
        priority: "high",
        status: "todo",
      }))
      .filter((row: any) => row.title && !existingKeys.has(`${row.channel ?? ""}::${row.title}`));

    if (rows.length === 0) return NextResponse.json({ ok: true, actions: [] });

    const { data, error } = await supabase.from("hospital_brand_diagnosis_actions").insert(rows).select("*");
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, actions: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "개선 항목 생성 실패" }, { status: 500 });
  }
}
