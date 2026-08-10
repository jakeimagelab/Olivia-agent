import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { PrepEquipmentItem } from "@/lib/work-journal/scheduleTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 이 촬영에서 아직 한 번도 안 건드린 장비는 schedule_equipment 행이 없다 — 매번 47개 전부를
// 응답하기 위해 equipment 마스터와 schedule_equipment를 서버에서 직접 merge한다.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("scheduleId");
  if (!scheduleId) return NextResponse.json({ ok: false, error: "scheduleId 필수" }, { status: 400 });

  const db = getSupabaseAdmin();
  const [{ data: equipmentRows, error: equipmentError }, { data: linkRows, error: linkError }] = await Promise.all([
    db.from("equipment").select("*").eq("active", true).order("category", { ascending: true }).order("sort_order", { ascending: true }),
    db.from("schedule_equipment").select("*").eq("schedule_id", scheduleId),
  ]);
  if (equipmentError) return NextResponse.json({ ok: false, error: equipmentError.message }, { status: 500 });
  if (linkError) return NextResponse.json({ ok: false, error: linkError.message }, { status: 500 });

  const linkByEquipmentId = new Map((linkRows ?? []).map((row) => [row.equipment_id, row]));
  const items: PrepEquipmentItem[] = (equipmentRows ?? []).map((eq) => {
    const link = linkByEquipmentId.get(eq.id);
    return {
      equipmentId: eq.id,
      scheduleEquipmentId: link?.id ?? null,
      name: eq.name,
      category: eq.category,
      selected: link?.selected ?? false,
      checked: link?.checked ?? false,
      memo: link?.memo ?? null,
    };
  });
  return NextResponse.json({ ok: true, items });
}

// 체크 토글 시 항상 이 upsert를 부른다 — schedule_equipment 행이 아직 없어도(처음 체크) 이 한
// 번의 호출로 생성+반영이 다 된다. 클라이언트는 equipmentId만 알면 되고 scheduleEquipmentId는 몰라도 된다.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body?.scheduleId || !body?.equipmentId) {
    return NextResponse.json({ ok: false, error: "scheduleId, equipmentId 필수" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    schedule_id: body.scheduleId,
    equipment_id: body.equipmentId,
    updated_at: new Date().toISOString(),
  };
  if (Object.prototype.hasOwnProperty.call(body, "selected")) patch.selected = body.selected;
  if (Object.prototype.hasOwnProperty.call(body, "checked")) patch.checked = body.checked;
  if (Object.prototype.hasOwnProperty.call(body, "memo")) patch.memo = body.memo;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("schedule_equipment")
    .upsert(patch, { onConflict: "schedule_id,equipment_id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    item: {
      equipmentId: data.equipment_id,
      scheduleEquipmentId: data.id,
      selected: !!data.selected,
      checked: !!data.checked,
      memo: data.memo ?? null,
    },
  });
}
