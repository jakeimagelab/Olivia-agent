import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

// quotes 테이블은 service_role 전용 RLS라 브라우저(anon)가 Realtime/직접 조회로 붙을 수 없다
// (Mobile Preview는 로그인 없는 공개 페이지라 anon 권한만 쓸 수 있음). 그래서 이 라우트가
// 초기 SSR과 클라이언트 폴링 둘 다의 유일한 데이터 통로다 — 항상 최신 quotes row를
// 읽어 고객 노출에 필요한 값만 걸러 반환한다(client_id/package_id/form_state 원본은 제외).
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const db = getSupabaseAdmin();

  const { data: share, error: shareError } = await db
    .from("quote_shares")
    .select("quote_id, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (shareError) return NextResponse.json({ ok: false, error: shareError.message }, { status: 500 });
  if (!share || share.revoked_at) return NextResponse.json({ ok: false, error: "링크를 찾을 수 없습니다." }, { status: 404 });

  const { data: quote, error: quoteError } = await db.from("quotes").select("*").eq("id", share.quote_id).maybeSingle();
  if (quoteError) return NextResponse.json({ ok: false, error: quoteError.message }, { status: 500 });
  if (!quote) return NextResponse.json({ ok: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const formState = quote.form_state && typeof quote.form_state === "object" ? quote.form_state as Record<string, unknown> : {};
  const brand = formState.brand === "jakeimage" ? "jakeimage" : "photoclinic";

  return NextResponse.json({
    ok: true,
    quote: {
      quoteNumber: quote.quote_number,
      title: quote.title,
      hospitalName: quote.hospital_name,
      quoteDate: quote.quote_date,
      shootDate: quote.shoot_date,
      validUntil: quote.valid_until,
      items: quote.items,
      supplyAmount: quote.supply_amount,
      discountAmount: quote.discount_amount,
      vat: quote.vat,
      totalAmount: quote.total_amount,
      depositAmount: quote.deposit_amount,
      balanceAmount: quote.balance_amount,
      depositRate: quote.deposit_rate,
      memos: quote.memos,
      status: quote.status,
      brand,
      updatedAt: quote.updated_at,
    },
  });
}
