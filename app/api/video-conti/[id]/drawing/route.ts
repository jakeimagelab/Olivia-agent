import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "video-conti-drawings";

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

const panelPath = (videoContiId: string, panelIndex: number) =>
  `${videoContiId}/panel-${panelIndex}.png`;

/* GET /api/video-conti/[id]/drawing → 그리드 크기, 칸별 메모, 칸별 이미지 URL */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(_req: NextRequest, ctx: any) {
  try {
    const { id } = await ctx.params;
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("video_conti")
      .select("storyboard_rows, storyboard_cols, storyboard_captions")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });

    const rows = data.storyboard_rows ?? 2;
    const cols = data.storyboard_cols ?? 2;
    const captions: string[] = data.storyboard_captions ?? [];
    const panelCount = rows * cols;

    await ensureBucket();
    const sb = getSupabaseAdmin();
    const panelUrls: (string | null)[] = await Promise.all(
      Array.from({ length: panelCount }, async (_, i) => {
        const { data: signed, error: signErr } = await sb.storage
          .from(BUCKET)
          .createSignedUrl(panelPath(id, i), 60 * 60);
        return signErr ? null : signed.signedUrl;
      })
    );

    return NextResponse.json({
      ok: true,
      rows,
      cols,
      captions,
      panelUrls,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/* POST /api/video-conti/[id]/drawing — { panelIndex, imageBase64?, caption? } */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: NextRequest, ctx: any) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const panelIndex = Number(body.panelIndex);
    if (!Number.isInteger(panelIndex) || panelIndex < 0) {
      return NextResponse.json({ ok: false, error: "panelIndex 필요" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    if (typeof body.imageBase64 === "string" && body.imageBase64) {
      await ensureBucket();
      const base64 = body.imageBase64.replace(/^data:image\/png;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const { error: uploadErr } = await db.storage
        .from(BUCKET)
        .upload(panelPath(id, panelIndex), buffer, { contentType: "image/png", upsert: true });
      if (uploadErr) throw uploadErr;
    }

    if (typeof body.caption === "string") {
      const { data, error: fetchErr } = await db
        .from("video_conti")
        .select("storyboard_captions")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      const captions: string[] = data.storyboard_captions ?? [];
      captions[panelIndex] = body.caption.slice(0, 60);
      const { error: updateErr } = await db
        .from("video_conti")
        .update({ storyboard_captions: captions, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) throw updateErr;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/* PUT /api/video-conti/[id]/drawing — { rows, cols } 그리드 크기 변경 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PUT(req: NextRequest, ctx: any) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const rows = Number(body.rows);
    const cols = Number(body.cols);
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 6 || cols > 6) {
      return NextResponse.json({ ok: false, error: "rows/cols는 1~6 사이 정수여야 합니다" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data, error: fetchErr } = await db
      .from("video_conti")
      .select("storyboard_rows, storyboard_cols, storyboard_captions")
      .eq("id", id)
      .single();
    if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 404 });

    const prevRows = data.storyboard_rows ?? 0;
    const prevCols = data.storyboard_cols ?? 0;
    const prevCount = prevRows * prevCols;
    const newCount = rows * cols;

    // 칸 수가 줄어들면 범위 밖 칸의 이미지를 Storage에서 정리한다.
    if (newCount < prevCount) {
      await ensureBucket();
      const removePaths = Array.from({ length: prevCount - newCount }, (_, i) => panelPath(id, newCount + i));
      await db.storage.from(BUCKET).remove(removePaths);
    }

    const captions: string[] = (data.storyboard_captions ?? []).slice(0, newCount);

    const { error: updateErr } = await db
      .from("video_conti")
      .update({
        storyboard_rows: rows,
        storyboard_cols: cols,
        storyboard_captions: captions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
