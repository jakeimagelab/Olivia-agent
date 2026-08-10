import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToEquipment } from "@/lib/work-journal/scheduleSerialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 장비 마스터 목록 — 읽기 전용(관리 UI는 Phase 1 범위 밖, 마이그레이션으로 시드만 관리).
export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("equipment")
    .select("*")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, equipment: (data ?? []).map(rowToEquipment) });
}
