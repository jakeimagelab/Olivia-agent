import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_PASSWORD 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  if (password !== adminPassword) {
    return NextResponse.json({ ok: false, error: "비밀번호를 다시 확인해주세요." }, { status: 401 });
  }

  // maxAge를 주지 않으면 브라우저 세션 쿠키가 되어, 브라우저를 완전히 종료하면 로그인이 풀린다 —
  // 다시 열 때마다 패스키(Face ID/Touch ID) 또는 비밀번호로 재인증하도록 하기 위함.
  const res = NextResponse.json({ ok: true });
  res.cookies.set("pc_admin_session", "active", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}
