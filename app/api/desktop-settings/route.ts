import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 관리자 1명 계정 구조라 사용자별 설정이 아니라 전역 설정 1행만 다룬다.
export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("olivia_desktop_settings")
    .select("wallpaper_mode, custom_wallpaper_data_url")
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data ?? { wallpaper_mode: "original", custom_wallpaper_data_url: null } });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.wallpaperMode === "string") update.wallpaper_mode = body.wallpaperMode;
  if (body.customWallpaperDataUrl !== undefined) update.custom_wallpaper_data_url = body.customWallpaperDataUrl;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "수정할 내용이 없습니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("olivia_desktop_settings").select("id").limit(1).maybeSingle();

  const { error } = existing
    ? await db.from("olivia_desktop_settings").update(update).eq("id", existing.id)
    : await db.from("olivia_desktop_settings").insert(update);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
