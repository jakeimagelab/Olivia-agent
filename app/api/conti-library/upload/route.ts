import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toAsciiStorageSegment } from "@/lib/storageKey";
import { rowToDocument } from "@/lib/conti-library/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "conti-case-library";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ ok: false, error: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ ok: false, error: "파일 크기는 50MB 이하만 가능합니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const bytes = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");

  const { data: existing } = await db.from("conti_case_documents").select("*").eq("file_hash", fileHash).maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, document: rowToDocument(existing), deduped: true });
  }

  const safeName = toAsciiStorageSegment(file.name.replace(/\.[^.]+$/, ""), "conti");
  const storagePath = `${Date.now()}-${safeName}.pdf`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });

  const { data, error } = await db
    .from("conti_case_documents")
    .insert({ file_name: file.name, storage_path: storagePath, file_hash: fileHash, status: "uploaded" })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "사례 등록 실패" }, { status: 500 });

  return NextResponse.json({ ok: true, document: rowToDocument(data), deduped: false }, { status: 201 });
}
