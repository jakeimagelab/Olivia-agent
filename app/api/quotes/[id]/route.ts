import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 견적 Workspace Modal의 resourceId 기반 불러오기(기존 견적서를 다시 편집) 용도로 추가한
// 단건 조회 라우트 — 지금까지는 목록(GET /api/quotes) / 발행(POST /api/quotes/[id]/publish)만 있었다.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, quote: data });
}
