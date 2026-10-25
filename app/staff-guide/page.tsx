import type { Metadata } from "next";
import StaffGuide, { type StaffGuideEquipment } from "@/components/staff-guide/StaffGuide";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "포토클리닉 스텝 가이드" };

export default async function StaffGuidePage() {
  let equipment: StaffGuideEquipment[] = [];
  try {
    const db = getSupabaseAdmin();
    const result = await db.from("equipment").select("*").eq("active", true).order("sort_order", { ascending: true });
    if (result.error) throw result.error;
    equipment = (result.data ?? []).map((row) => ({
      name: row.name,
      category: row.category,
      quantity: Math.max(1, Number(row.quantity) || 1),
      usage: row.usage ?? null,
      note: row.note ?? null,
    }));
  } catch (error) {
    console.error("[staff-guide] 장비 목록 조회 실패", error);
  }
  return <StaffGuide equipment={equipment} />;
}
