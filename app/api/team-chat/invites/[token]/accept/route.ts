import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const password = String(body?.password || "");
  const displayName = String(body?.displayName || "").trim();

  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ ok: false, error: "이름을 입력해주세요." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: invite } = await db.from("team_invites").select("*").eq("token", token).maybeSingle();
  if (!invite) return NextResponse.json({ ok: false, error: "초대를 찾을 수 없습니다." }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ ok: false, error: "이미 사용된 초대입니다." }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ ok: false, error: "만료된 초대입니다." }, { status: 400 });

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ ok: false, error: createError?.message || "계정 생성에 실패했습니다." }, { status: 500 });
  }

  const { error: memberError } = await db.from("chat_members").insert({
    id: created.user.id,
    email: invite.email,
    display_name: displayName,
  });
  if (memberError) {
    return NextResponse.json({ ok: false, error: memberError.message }, { status: 500 });
  }

  await db.from("team_invites").update({ accepted_at: new Date().toISOString() }).eq("token", token);

  const supabase = await getTeamChatSupabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password });
  if (signInError) {
    return NextResponse.json(
      { ok: false, error: "가입은 완료됐지만 로그인에는 실패했습니다. 로그인 화면에서 다시 시도해주세요." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
