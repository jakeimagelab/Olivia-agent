import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "work-journal-files";

type Params = { params: Promise<{ fileId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { fileId } = await params;
  const db = getSupabaseAdmin();
  const { data: file } = await db.from("work_journal_files").select("storage_path").eq("id", fileId).maybeSingle();
  if (file?.storage_path) await db.storage.from(BUCKET).remove([file.storage_path]);

  const { error } = await db.from("work_journal_files").delete().eq("id", fileId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
