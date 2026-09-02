import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_REVIEW_TEMPLATES } from "@/lib/reviewContent/defaultReviewTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기본 템플릿 10종을 review_layout_assets에 1회성으로 등록한다. 이름 기준으로 이미 있는
// builtin 행은 건너뛰어 몇 번을 다시 호출해도 중복 생성되지 않는다(idempotent). GET도 받는 건
// 관리자가 DevTools 콘솔 없이 브라우저 주소창에 URL만 열어서 실행할 수 있게 하기 위함 —
// 멱등이라 실수로 여러 번 열려도 안전하다.
async function runSeed(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const db = getSupabaseAdmin();
  const { data: existing, error: existingError } = await db
    .from("review_layout_assets")
    .select("name")
    .eq("asset_type", "builtin");
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  const existingNames = new Set((existing ?? []).map((row) => row.name));

  const toInsert = DEFAULT_REVIEW_TEMPLATES
    .filter((template) => !existingNames.has(template.name))
    .map((template) => ({
      name: template.name,
      description: template.description,
      ratio: "4:5",
      asset_type: "builtin",
      reference_storage_path: null,
      thumbnail_storage_path: null,
      layout_config: template.layoutConfig,
      created_by: "system",
    }));

  if (!toInsert.length) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: DEFAULT_REVIEW_TEMPLATES.length });
  }

  const { error: insertError } = await db.from("review_layout_assets").insert(toInsert);
  if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: toInsert.length, skipped: DEFAULT_REVIEW_TEMPLATES.length - toInsert.length });
}

export async function POST(req: NextRequest) {
  return runSeed(req);
}

export async function GET(req: NextRequest) {
  return runSeed(req);
}
