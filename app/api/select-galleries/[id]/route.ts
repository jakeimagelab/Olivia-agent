import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGalleryImages, getLatestSelection, getRawMatches } from "@/lib/selectGallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const { data: gallery, error } = await sb
      .from("select_galleries")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });

    const [images, selection, rawMatches, allRawMatches] = await Promise.all([
      getGalleryImages(sb, id),
      getLatestSelection(sb, id),
      getRawMatches(sb, id),
      getRawMatches(sb, id, { includeInvalidated: true }),
    ]);

    return NextResponse.json({
      ok: true,
      gallery,
      images,
      selection,
      rawMatches,
      invalidatedRawMatchCount: allRawMatches.filter((match) => match.invalidated_at).length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const allowed = new Set([
      "title", "hospital_name", "shooting_name", "shooting_date", "status",
      "allow_web_select", "allow_download_upload", "allow_download_zip", "allow_resubmit",
      "file_expires_at", "nas_link", "view_mode", "bridge_source", "bridge_folder_path",
      "bridge_folder_display_path", "client_id", "workflow_run_id", "photo_storage_project_id",
    ]);
    const changes: Record<string, unknown> = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)));
    if (changes.view_mode !== undefined && changes.view_mode !== "classic" && changes.view_mode !== "bridge") {
      return NextResponse.json({ ok: false, error: "없는 고객 화면 방식입니다." }, { status: 400 });
    }
    if (changes.bridge_source !== undefined && changes.bridge_source !== null && changes.bridge_source !== "local" && changes.bridge_source !== "remote") {
      return NextResponse.json({ ok: false, error: "없는 Bridge 폴더 방식입니다." }, { status: 400 });
    }
    if (changes.bridge_source === "local") changes.bridge_folder_path = null;
    if (typeof changes.bridge_folder_path === "string" && !/^root-\d+(?:\/|$)/.test(changes.bridge_folder_path)) {
      return NextResponse.json({ ok: false, error: "원격 폴더는 안전한 가상 경로만 저장할 수 있습니다." }, { status: 400 });
    }
    if (!Object.keys(changes).length) return NextResponse.json({ ok: false, error: "변경할 항목이 없습니다." }, { status: 400 });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("select_galleries")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, gallery: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
