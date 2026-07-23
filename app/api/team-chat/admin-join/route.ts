import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자(pc_admin_session)는 초대 링크 없이 바로 팀 채팅에 참여할 수 있어야 한다.
// pc_admin_session만으로는 Realtime/RLS가 요구하는 auth.uid()가 없으므로, 고정된 관리자
// 이메일로 Supabase Auth 계정을 (없으면) generateLink가 자동 생성하고, 그 토큰으로 이 요청
// 안에서 바로 로그인 처리한다 — 비밀번호를 따로 만들거나 저장할 필요가 없다.
const ADMIN_CHAT_EMAIL = process.env.ADMIN_CHAT_EMAIL || "jakeimagelab@gmail.com";
const ADMIN_CHAT_DISPLAY_NAME = "정연호 대표";

export async function POST(req: NextRequest) {
  if (req.cookies.get("pc_admin_session")?.value !== "active") {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const db = getSupabaseAdmin();

  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: ADMIN_CHAT_EMAIL,
  });
  if (linkError || !linkData?.properties?.hashed_token || !linkData.user) {
    return NextResponse.json({ ok: false, error: linkError?.message || "관리자 계정 준비에 실패했습니다." }, { status: 500 });
  }

  const { data: existingMember } = await db
    .from("chat_members")
    .select("id")
    .eq("id", linkData.user.id)
    .maybeSingle();
  if (!existingMember) {
    const { error: memberError } = await db.from("chat_members").insert({
      id: linkData.user.id,
      email: ADMIN_CHAT_EMAIL,
      display_name: ADMIN_CHAT_DISPLAY_NAME,
      is_admin: true,
    });
    if (memberError) {
      return NextResponse.json({ ok: false, error: memberError.message }, { status: 500 });
    }
  }
  await db.from("chat_members").update({ is_admin: true }).eq("id", linkData.user.id);

  const supabase = await getTeamChatSupabaseServer();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyError) {
    return NextResponse.json({ ok: false, error: verifyError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
