import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildBackgroundPrompt, getBackgroundGenerator, type BackgroundGenerationInput } from "@/lib/reviewContent/backgroundGenerator";
import { REVIEW_CONTENT_BUCKET, signReviewAsset, validReviewAssetPath } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const STYLES = ["minimal", "clinic", "editorial", "luxury", "natural"] as const;
const TONES = ["white", "cream", "mint", "beige", "deep-green"] as const;
const TEXTURES = ["paper", "shadow", "botanical", "marble", "fabric"] as const;

function parseInput(body: Record<string, unknown>): BackgroundGenerationInput {
  const style = STYLES.includes(body.style as typeof STYLES[number]) ? body.style as typeof STYLES[number] : "minimal";
  const tone = TONES.includes(body.tone as typeof TONES[number]) ? body.tone as typeof TONES[number] : "cream";
  const textures = Array.isArray(body.textures)
    ? body.textures.filter((value): value is typeof TEXTURES[number] => TEXTURES.includes(value as typeof TEXTURES[number])).slice(0, 5)
    : [];
  return {
    style,
    tone,
    textures,
    prompt: String(body.prompt || "").trim().slice(0, 500),
    count: Math.max(1, Math.min(3, Number(body.count) || 3)),
  };
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const input = parseInput(body);
    const generated = await getBackgroundGenerator().generate(input);
    const db = getSupabaseAdmin();
    const prompt = buildBackgroundPrompt(input);
    const assets = await Promise.all(generated.map(async (image) => {
      const assetId = randomUUID();
      const storagePath = `generated/${assetId}/review-background.png`;
      const { error: uploadError } = await db.storage.from(REVIEW_CONTENT_BUCKET).upload(storagePath, image.bytes, {
        contentType: image.mimeType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);
      const url = await signReviewAsset(db, storagePath, 60 * 60 * 6);
      if (!url) throw new Error("생성된 배경 URL을 준비하지 못했습니다.");
      const { error: recordError } = await db.from("generated_images").insert({
        id: assetId,
        mode: "real",
        scene_type: "review-background",
        mood: input.style,
        lighting: input.tone,
        usage: "review-content-studio",
        extra_request: input.prompt,
        prompt,
        image_url: storagePath,
        status: "draft",
        reference_info: {
          source: "ai",
          storagePath,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          provider: image.provider,
          model: image.model,
          textures: input.textures,
        },
      });
      // 일부 오래된 환경에는 generated_images 테이블이 없을 수 있다. 자산은 이미 Olivia
      // controlled storage에 안전하게 들어갔고 페이지 document가 assetId/path를 저장하므로
      // 편집 흐름은 계속 가능하다. 테이블이 있는 환경에서는 Library record도 함께 남는다.
      if (recordError) console.warn("review background asset record skipped", recordError.message);
      return { assetId, storagePath, url, mimeType: image.mimeType, width: image.width, height: image.height, source: "ai" as const };
    }));
    return NextResponse.json({ ok: true, assets });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AI 배경 생성에 실패했습니다." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("generated_images")
    .select("id,image_url,reference_info,created_at")
    .eq("scene_type", "review-background")
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) return NextResponse.json({ ok: true, assets: [] });
  const assets = await Promise.all((data || []).filter((row) => validReviewAssetPath(row.image_url || "")).map(async (row) => ({
    assetId: row.id,
    storagePath: row.image_url,
    url: await signReviewAsset(db, row.image_url, 60 * 60 * 6),
    mimeType: row.reference_info?.mimeType || "image/png",
    width: row.reference_info?.width,
    height: row.reference_info?.height,
    source: "ai",
    createdAt: row.created_at,
  })));
  return NextResponse.json({ ok: true, assets: assets.filter((asset) => asset.url) });
}
