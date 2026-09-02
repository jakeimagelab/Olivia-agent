import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findOrCreateReviewContent } from "@/lib/reviewContent/reviewContentService";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 리뷰 관리 목록의 [콘텐츠 만들기] 버튼이 호출한다 — 이미 콘텐츠가 있으면 그 id를,
// 없으면 draft 상태로 새로 만들어 id를 돌려준다. 실제 스토리(이미지 시안) 생성은 여기서
// 하지 않는다(에디터 진입 후 "스토리 자동 생성" 버튼이 담당).
export async function POST(req: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { reviewId } = await context.params;
  try {
    const result = await findOrCreateReviewContent(getSupabaseAdmin(), reviewId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
