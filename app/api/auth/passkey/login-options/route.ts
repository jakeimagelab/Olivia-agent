import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rpFromRequest, saveChallenge } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { rpID } = rpFromRequest(req);

  const { data: passkeys } = await db.from("admin_passkeys").select("credential_id, transports");
  if (!passkeys || passkeys.length === 0) {
    return NextResponse.json({ ok: false, error: "등록된 패스키가 없습니다." }, { status: 404 });
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map((p) => ({
      id: p.credential_id,
      transports: (p.transports ?? []) as any,
    })),
    userVerification: "preferred",
  });

  await saveChallenge(db, options.challenge, "login");

  return NextResponse.json({ ok: true, options });
}
