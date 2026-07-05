import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.NEXTAUTH_URL + "/api/auth/google/callback";

  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID 미설정" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "openid email profile https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly",
    access_type:   "offline",
    prompt:        "consent",
  });

  return NextResponse.redirect(
    "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString()
  );
}
