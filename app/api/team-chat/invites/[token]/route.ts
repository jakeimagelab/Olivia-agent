import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 초대 링크를 연 사람은 아직 로그인 전이라 완전히 공개 라우트다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getSupabaseAdmin();
  const { data: invite } = await db
    .from("team_invites")
    .select("email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ ok: false, error: "초대를 찾을 수 없습니다." }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ ok: false, error: "이미 사용된 초대입니다." }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ ok: false, error: "만료된 초대입니다." }, { status: 400 });

  return NextResponse.json({ ok: true, email: invite.email });
}
