import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rpFromRequest, saveChallenge, isAdminSession, RP_NAME } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  let rpID: string;
  try { ({ rpID } = rpFromRequest(req)); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "접속 주소를 확인하지 못했습니다." }, { status: 400 }); }

  let { data: existing, error } = await db.from("admin_passkeys").select("credential_id, transports, rp_id").eq("rp_id", rpID);
  if (error && /rp_id|column/i.test(error.message)) {
    ({ data: existing, error } = await db.from("admin_passkeys").select("credential_id, transports"));
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: "admin",
    userDisplayName: "포토클리닉 관리자",
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((p) => ({
      id: p.credential_id,
      transports: (p.transports ?? []) as any,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  try { await saveChallenge(db, options.challenge, "register"); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "등록 준비에 실패했습니다." }, { status: 500 }); }

  return NextResponse.json({ ok: true, options });
}
