import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signReviewAsset } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("review_layout_assets").select("*").eq("is_active", true).order("created_at");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const assets = await Promise.all((data ?? []).map(async (asset) => ({
    ...asset,
    referenceUrl: await signReviewAsset(db, asset.reference_storage_path),
    thumbnailUrl: await signReviewAsset(db, asset.thumbnail_storage_path),
  })));
  return NextResponse.json({ ok: true, assets });
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return unauthorized();
  const body = await req.json();
  const name = String(body.name || "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ ok: false, error: "레이아웃 이름을 입력해주세요." }, { status: 400 });
  if (!["1:1", "4:5", "9:16"].includes(body.ratio || "4:5")) {
    return NextResponse.json({ ok: false, error: "지원하지 않는 비율입니다." }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin().from("review_layout_assets").insert({
    name,
    description: String(body.description || "").slice(0, 500),
    ratio: body.ratio || "4:5",
    asset_type: body.assetType === "builtin" ? "builtin" : "reference",
    reference_storage_path: body.referenceStoragePath || null,
    thumbnail_storage_path: body.thumbnailStoragePath || body.referenceStoragePath || null,
    layout_config: body.layoutConfig || {},
    created_by: "admin",
  }).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, asset: data });
}
