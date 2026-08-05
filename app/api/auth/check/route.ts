import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 로컬 개발(`next dev`)에서는 로그인 화면을 매번 거치지 않도록 인증된 것으로 처리한다.
  // NODE_ENV는 Vercel/프로덕션 빌드에서 항상 "production"이라 배포본에는 영향이 없다.
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ ok: true, authenticated: true });
  }
  const authenticated = req.cookies.get("pc_admin_session")?.value === "active";
  return NextResponse.json({ ok: true, authenticated });
}
