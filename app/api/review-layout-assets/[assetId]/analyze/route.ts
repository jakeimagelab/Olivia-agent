import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { REVIEW_CONTENT_BUCKET, validReviewAssetPath } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_CONFIG = {
  template: "text_only",
  background: "#155855",
  accent: "#E85D2C",
  textColor: "#FFFFFF",
};

export async function POST(req: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const { assetId } = await context.params;
  const db = getSupabaseAdmin();
  const { data: asset, error } = await db.from("review_layout_assets").select("*").eq("id", assetId).maybeSingle();
  if (error || !asset) return NextResponse.json({ ok: false, error: "레이아웃을 찾지 못했습니다." }, { status: 404 });
  if (!validReviewAssetPath(asset.reference_storage_path || "")) {
    return NextResponse.json({ ok: false, error: "분석할 레퍼런스 이미지가 없습니다." }, { status: 400 });
  }

  let layoutConfig = DEFAULT_CONFIG;
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    const { data: file, error: downloadError } = await db.storage.from(REVIEW_CONTENT_BUCKET).download(asset.reference_storage_path);
    if (downloadError || !file) return NextResponse.json({ ok: false, error: "레퍼런스를 읽지 못했습니다." }, { status: 500 });
    const mediaType = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const anthropic = new Anthropic({ apiKey: key });
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: `이 인스타그램 레퍼런스의 레이아웃 구조만 분석하세요. 원본 디자인을 복제하지 않습니다.
JSON만 반환:
{"template":"photo_bottom|photo_overlay|text_only|frame|accent_bar","background":"#RRGGBB","accent":"#RRGGBB","textColor":"#RRGGBB"}` },
        ],
      }],
    });
    const raw = response.content.filter((item) => item.type === "text").map((item) => item.text).join("");
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) layoutConfig = { ...DEFAULT_CONFIG, ...JSON.parse(match[0]) };
  }

  const { data: updated, error: updateError } = await db.from("review_layout_assets")
    .update({ layout_config: layoutConfig })
    .eq("id", assetId)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, asset: updated, layoutConfig });
}
