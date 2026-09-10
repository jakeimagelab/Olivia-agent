import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function makeToken(): string {
  return randomBytes(16).toString("hex");
}

// 같은 견적으로 이미 발급된(취소 안 된) 토큰이 있으면 재사용한다 — 버튼을 여러 번
// 눌러도 링크가 계속 늘어나지 않는다(conti_run_shares와 동일 패턴).
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  const { data: quote, error: quoteError } = await db.from("quotes").select("id").eq("id", id).maybeSingle();
  if (quoteError) return NextResponse.json({ ok: false, error: quoteError.message }, { status: 500 });
  if (!quote) return NextResponse.json({ ok: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const { data: existing, error: existingError } = await db
    .from("quote_shares")
    .select("token")
    .eq("quote_id", id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://olivia.photoclinic.kr";
  if (existing) {
    return NextResponse.json({ ok: true, token: existing.token, url: `${baseUrl}/quote-preview/m/${existing.token}` });
  }

  const token = makeToken();
  const { error: insertError } = await db.from("quote_shares").insert({ quote_id: id, token });
  if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, token, url: `${baseUrl}/quote-preview/m/${token}` });
}
