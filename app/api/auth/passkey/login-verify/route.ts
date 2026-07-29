import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rpFromRequest, consumeChallenge, rowToCredential } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.response) {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  let rpID: string;
  let origin: string;
  try { ({ rpID, origin } = rpFromRequest(req)); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "접속 주소를 확인하지 못했습니다." }, { status: 400 }); }
  const credentialId = body.response.id as string;

  const { data: row } = await db
    .from("admin_passkeys")
    .select("*")
    .eq("credential_id", credentialId)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ ok: false, error: "등록되지 않은 패스키입니다." }, { status: 401 });
  }
  if (row.rp_id && row.rp_id !== rpID) {
    return NextResponse.json({ ok: false, error: `이 패스키는 ${row.rp_id}에서 등록되어 현재 주소에서 사용할 수 없습니다.` }, { status: 401 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: (challenge) => consumeChallenge(db, challenge, "login"),
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: rowToCredential(row),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "패스키 인증에 실패했습니다." },
      { status: 401 },
    );
  }

  if (!verification.verified) {
    return NextResponse.json({ ok: false, error: "패스키 인증에 실패했습니다." }, { status: 401 });
  }

  await db
    .from("admin_passkeys")
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  // 30일간 로그인이 유지되도록 한다 — 브라우저를 완전히 종료해도 매번 재인증할 필요 없이
  // 올리비아 챗봇 등 로그인 상태에 의존하는 전역 UI가 계속 떠 있도록 하기 위함.
  const res = NextResponse.json({ ok: true });
  res.cookies.set("pc_admin_session", "active", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
