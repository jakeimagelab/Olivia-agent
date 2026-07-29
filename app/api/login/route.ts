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
