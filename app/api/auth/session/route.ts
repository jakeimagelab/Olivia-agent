import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("pc_session");
  if (!cookie) {
    return NextResponse.json({ ok: false, session: null });
  }
  try {
    const data = JSON.parse(Buffer.from(cookie.value, "base64").toString());
    if (Date.now() > data.expiresAt) {
      return NextResponse.json({ ok: false, session: null });
    }
    return NextResponse.json({
      ok: true,
      session: { name: data.name, email: data.email, accessToken: data.accessToken },
    });
  } catch {
    return NextResponse.json({ ok: false, session: null });
  }
}
