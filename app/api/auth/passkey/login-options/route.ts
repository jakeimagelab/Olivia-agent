import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { passkeyDomainMessage, rpFromRequest, saveChallenge } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  let rpID: string;
  try { ({ rpID } = rpFromRequest(req)); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "접속 주소를 확인하지 못했습니다." }, { status: 400 }); }

  let { data: passkeys, error } = await db.from("admin_passkeys").select("credential_id, transports, rp_id").eq("rp_id", rpID);
  let legacySchema = false;
  if (error && /rp_id|column/i.test(error.message)) {
    legacySchema = true;
    ({ data: passkeys, error } = await db.from("admin_passkeys").select("credential_id, transports"));
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!passkeys || passkeys.length === 0) {
    return NextResponse.json({ ok: false, error: passkeyDomainMessage(rpID), code: "PASSKEY_RP_MISMATCH" }, { status: 409 });
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map((p) => ({
      id: p.credential_id,
      transports: (p.transports ?? []) as any,
    })),
    userVerification: "preferred",
  });

  try { await saveChallenge(db, options.challenge, "login"); }
  catch (challengeError) { return NextResponse.json({ ok: false, error: challengeError instanceof Error ? challengeError.message : "로그인 준비에 실패했습니다." }, { status: 500 }); }

  return NextResponse.json({ ok: true, options, legacySchema });
}
