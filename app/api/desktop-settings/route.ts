import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_DESKTOP_FAVORITE_KEYS, normalizeDesktopFavoriteKeys } from "@/lib/olivia/desktopFavorites";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 관리자 1명 계정 구조라 사용자별 설정이 아니라 전역 설정 1행만 다룬다.
export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("olivia_desktop_settings")
    .select("wallpaper_mode, custom_wallpaper_data_url, favorite_app_keys")
    .limit(1)
    .maybeSingle();
  if (error) {
    // 코드가 DB migration보다 먼저 배포돼도 기존 배경화면 설정 조회까지 깨지지 않게 한다.
    // 즐겨찾기 저장은 migration 적용 전에는 PATCH가 실패해 UI가 명확히 rollback한다.
    const fallback = await db
      .from("olivia_desktop_settings")
      .select("wallpaper_mode, custom_wallpaper_data_url")
      .limit(1)
      .maybeSingle();
    if (fallback.error) return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      settings: {
        ...(fallback.data ?? { wallpaper_mode: "original", custom_wallpaper_data_url: null }),
        favorite_app_keys: [...DEFAULT_DESKTOP_FAVORITE_KEYS],
      },
    });
  }
  return NextResponse.json({
    ok: true,
    settings: data
      ? { ...data, favorite_app_keys: normalizeDesktopFavoriteKeys(data.favorite_app_keys) }
      : {
          wallpaper_mode: "original",
          custom_wallpaper_data_url: null,
          favorite_app_keys: [...DEFAULT_DESKTOP_FAVORITE_KEYS],
        },
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.wallpaperMode === "string") update.wallpaper_mode = body.wallpaperMode;
  if (body.customWallpaperDataUrl !== undefined) update.custom_wallpaper_data_url = body.customWallpaperDataUrl;
  if (body.favoriteAppKeys !== undefined) {
    if (!Array.isArray(body.favoriteAppKeys)) {
      return NextResponse.json({ ok: false, error: "즐겨찾기 형식이 올바르지 않습니다." }, { status: 400 });
    }
    update.favorite_app_keys = normalizeDesktopFavoriteKeys(body.favoriteAppKeys);
  }
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
