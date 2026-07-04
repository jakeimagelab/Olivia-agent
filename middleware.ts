import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

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
  "/api/workflow",
  "/api/agent",
  "/api/clients",
  "/api/projects",
  "/api/quotes",
];

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (pathname === "/__mw_probe") {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from("quotes").select("id").limit(1);
      return NextResponse.json({ ok: true, supabaseReachable: true, error: error?.message ?? null });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
    }
  }

  const shouldProtect = protectedApiPrefixes.some((prefix) => pathname.startsWith(prefix));
  if (!shouldProtect) return NextResponse.next();

  const internalKey = req.headers.get("x-internal-key");
  if (internalKey && internalKey === process.env.INTERNAL_API_KEY) {
    return NextResponse.next();
  }

  const isAuthenticated = req.cookies.get("pc_admin_session")?.value === "active";
  if (isAuthenticated) return NextResponse.next();

  return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*", "/__mw_probe"]
};
