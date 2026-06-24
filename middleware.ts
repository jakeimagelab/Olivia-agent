import { NextRequest, NextResponse } from "next/server";

const protectedApiPrefixes = [
  "/api/olivia",
  "/api/send-delivery",
  "/api/send-contract",
  "/api/image-generator",
  "/api/variation",
  "/api/conti",
  "/api/website-design",
  "/api/report",
  "/api/ocr-pdf",
  "/api/blog",
];

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const shouldProtect = protectedApiPrefixes.some((prefix) => pathname.startsWith(prefix));
  if (!shouldProtect) return NextResponse.next();

  // 내부 서버→서버 호출 허용 (Telegram webhook 등)
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey && internalKey === process.env.INTERNAL_API_KEY) {
    return NextResponse.next();
  }

  const isAuthenticated = req.cookies.get("pc_admin_session")?.value === "active";
  if (isAuthenticated) return NextResponse.next();

  return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"]
};
