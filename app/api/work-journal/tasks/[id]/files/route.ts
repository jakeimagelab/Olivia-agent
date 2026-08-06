import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toAsciiStorageSegment } from "@/lib/storageKey";
import { rowToFile } from "@/lib/work-journal/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "work-journal-files";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ ok: false, error: "파일 크기는 20MB 이하만 가능합니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const safeName = toAsciiStorageSegment(file.name.replace(/\.[^.]+$/, ""), "file");
  const storagePath = `${id}/${Date.now()}-${safeName}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath);
  const { data, error } = await db
    .from("work_journal_files")
    .insert({ task_id: id, file_name: file.name, file_size: file.size, storage_path: storagePath, file_url: urlData.publicUrl })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "첨부파일 저장 실패" }, { status: 500 });
  return NextResponse.json({ ok: true, file: rowToFile(data) }, { status: 201 });
}
