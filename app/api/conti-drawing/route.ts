import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "conti-drawings";

const safeKey = (name: string) =>
  name.trim().replace(/[^a-zA-Z0-9가-힣._-]/g, "_").slice(0, 100);

const ensureBucket = async () => {
  const sb = getSupabaseAdmin();
  const { data: buckets } = await sb.storage.listBuckets();
  if (buckets?.some(b => b.name === BUCKET)) return;
  await sb.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/png"],
  });
};

/* GET /api/conti-drawing?hospital=xxx  → signed URL 반환 */
export async function GET(req: NextRequest) {
  try {
    const hospital = req.nextUrl.searchParams.get("hospital");
    if (!hospital) return NextResponse.json({ ok: false, error: "hospital 파라미터 필요" }, { status: 400 });

    await ensureBucket();
    const sb = getSupabaseAdmin();
    const path = `${safeKey(hospital)}/drawing.png`;

    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (error) return NextResponse.json({ ok: true, url: null }); // 파일 없음 = 정상

    return NextResponse.json({ ok: true, url: data.signedUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/* POST /api/conti-drawing  — FormData: file(PNG Blob) + hospital(string) */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const hospital = form.get("hospital");

    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "file 필드 없음" }, { status: 400 });
    if (!hospital || typeof hospital !== "string") return NextResponse.json({ ok: false, error: "hospital 필드 없음" }, { status: 400 });

    await ensureBucket();
    const sb = getSupabaseAdmin();
    const path = `${safeKey(hospital)}/drawing.png`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
      contentType: "image/png",
      upsert: true,
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/* DELETE /api/conti-drawing?hospital=xxx */
export async function DELETE(req: NextRequest) {
  try {
    const hospital = req.nextUrl.searchParams.get("hospital");
    if (!hospital) return NextResponse.json({ ok: false, error: "hospital 파라미터 필요" }, { status: 400 });

    const sb = getSupabaseAdmin();
    const path = `${safeKey(hospital)}/drawing.png`;
    await sb.storage.from(BUCKET).remove([path]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
