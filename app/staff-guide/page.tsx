import StaffGuideClient from "@/app/staff-guide/StaffGuideClient";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Equipment } from "@/lib/work-journal/scheduleTypes";

export const dynamic = "force-dynamic";

export default async function StaffGuidePage() {
  let equipment: Equipment[] = [];
  let loadError = "";
  try {
    const db = getSupabaseAdmin();
    const result = await db.from("equipment").select("id,name,category,quantity,usage,note,active,sort_order").eq("active", true).order("sort_order", { ascending: true });
    if (result.error) throw result.error;
    equipment = (result.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      quantity: Math.max(1, Number(row.quantity) || 1),
      usage: row.usage ?? null,
      note: row.note ?? null,
      active: true,
      sortOrder: row.sort_order ?? 0,
    }));
  } catch {
    loadError = "전체 장비 목록을 불러오지 못했습니다. 현장 담당자에게 확인해 주세요.";
  }
  return <StaffGuideClient equipment={equipment} loadError={loadError} />;
}
