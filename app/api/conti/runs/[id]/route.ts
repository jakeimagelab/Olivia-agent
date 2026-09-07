import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  const { data: run, error: runError } = await db.from("conti_runs").select("*").eq("id", id).maybeSingle();
  if (runError) return NextResponse.json({ ok: false, error: runError.message }, { status: 500 });
  if (!run) return NextResponse.json({ ok: false, error: "run을 찾을 수 없습니다." }, { status: 404 });

  const [{ data: groups, error: groupsError }, { data: scenes, error: scenesError }] = await Promise.all([
    db.from("conti_groups").select("*").eq("run_id", id).order("sort"),
    db.from("conti_scenes").select("*").eq("run_id", id).order("sort"),
  ]);
  if (groupsError) return NextResponse.json({ ok: false, error: groupsError.message }, { status: 500 });
  if (scenesError) return NextResponse.json({ ok: false, error: scenesError.message }, { status: 500 });

  return NextResponse.json({ ok: true, run, groups: groups ?? [], scenes: scenes ?? [] });
}
