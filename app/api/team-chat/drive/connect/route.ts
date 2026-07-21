import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 대표 Drive 계정 연결은 관리자만 시작할 수 있다. 기존 /mailing Gmail 연동과 같은
// GOOGLE_CLIENT_ID/SECRET을 재사용하되, 완전히 별개의 리다이렉트 URI + drive.file 스코프로 연결한다.
export async function GET(req: NextRequest) {
  if (req.cookies.get("pc_admin_session")?.value !== "active") {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.NEXTAUTH_URL || "https://olivia.photoclinic.kr";
  if (!clientId) return NextResponse.json({ error: "GOOGLE_CLIENT_ID 미설정" }, { status: 500 });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/team-chat/drive/callback`,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
