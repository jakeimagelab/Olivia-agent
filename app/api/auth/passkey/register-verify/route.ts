import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rpFromRequest, consumeChallenge, encodePublicKey, isAdminSession } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.response) {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { rpID, origin } = rpFromRequest(req);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: (challenge) => consumeChallenge(db, challenge, "register"),
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "패스키 등록에 실패했습니다." },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ ok: false, error: "패스키 등록에 실패했습니다." }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  const { error } = await db.from("admin_passkeys").insert({
    credential_id: credential.id,
    public_key: encodePublicKey(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_name: typeof body.deviceName === "string" ? body.deviceName.slice(0, 120) : "",
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
