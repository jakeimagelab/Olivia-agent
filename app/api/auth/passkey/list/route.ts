import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  const primary = await db
    .from("admin_passkeys")
    .select("id, device_name, created_at, last_used_at, rp_id")
    .order("created_at", { ascending: false });
  let data: Array<{ id: string; device_name: string; created_at: string; last_used_at: string | null; rp_id: string | null }> | null = primary.data;
  let error = primary.error;
  if (error && /rp_id|column/i.test(error.message)) {
    const fallback = await db
      .from("admin_passkeys")
      .select("id, device_name, created_at, last_used_at")
      .order("created_at", { ascending: false });
    data = fallback.data?.map((row) => ({ ...row, rp_id: null })) ?? null;
    error = fallback.error;
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, passkeys: data ?? [] });
}
