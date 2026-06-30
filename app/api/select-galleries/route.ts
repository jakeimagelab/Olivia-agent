import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateShareToken, getFileExpiresAt } from "@/lib/selectGallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("select_galleries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, galleries: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, hospital_name, shooting_name, shooting_date, client_id, workflow_run_id, expire_days = 3 } = body;
    if (!title) return NextResponse.json({ ok: false, error: "title 필수" }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("select_galleries")
      .insert({
        title,
        hospital_name,
        shooting_name,
        shooting_date,
        client_id,
        workflow_run_id,
        share_token: generateShareToken(),
        status: "draft",
        allow_web_select: true,
        allow_download_upload: true,
        allow_download_zip: true,
        allow_resubmit: false,
        file_expires_at: getFileExpiresAt(expire_days),
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, gallery: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
