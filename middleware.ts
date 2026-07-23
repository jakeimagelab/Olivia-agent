import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase";

// 팀 채팅 데이터 API(방/멤버 조회 등)는 RLS가 auth.uid() 기준으로 동작해서 pc_admin_session만으로는
// 애초에 유효한 조회가 안 된다 — 실제 Supabase Auth 세션(sb-* 쿠키)이 있는지 직접 확인한다.
// 초대 발급/Drive 연결처럼 관리자 전용인 라우트는 각 핸들러 안에서 pc_admin_session을 따로 체크한다
// (여기서 prefix로 뭉뚱그리면 /api/team-chat/invites/[token]/accept 같은 공개 라우트까지 막혀버린다).
async function hasValidTeamChatMemberSession(req: NextRequest): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() { /* 미들웨어에서는 읽기만 — 토큰 갱신은 팀챗 API 라우트에서 처리 */ },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

const protectedApiPrefixes = [
  "/api/admin",
  "/api/dashboard",
  "/api/trash",
  "/api/olivia",
  "/api/send-delivery",
  "/api/send-contract",
  "/api/image-director",
  "/api/variation",
  "/api/conti",
  "/api/conti-chat",
  "/api/conti-drawing",
  "/api/conti-images",
  "/api/website-design",
  "/api/report",
  "/api/ocr-pdf",
  "/api/select-match",
  "/api/blog",
  "/api/workflow",
  "/api/agent",
  "/api/clients",
  "/api/projects",
  "/api/quotes",
  "/api/contracts",
  "/api/memo",
  "/api/calendar",
  "/api/mailing",
  "/api/contacts",
  "/api/select-galleries",
  "/api/send-brand-mail",
  "/api/video-conti",
  "/api/brand-analysis",
  "/api/channel-analysis",
  "/api/daily-ideas",
  "/api/naver-place",
  "/api/medical-ad-check",
  "/api/reviews",
  "/api/submit",
  "/api/seo-delivery",
  "/api/photo-scene-analyze",
  "/api/studio-face-analysis",
  "/api/studio-analysis",
  "/api/portrait-check",
  "/api/video-classify",
  "/api/scene-naming",
  "/api/color-sync",
  "/api/color-check",
  "/api/share-links",
  "/api/prompter-scripts",
  "/api/prompter-projects",
  "/api/prompter-proofread",
];

// 외부 공유 링크가 허용하는 기능 페이지 → 그 기능에 실제로 필요한 API prefix만 나열.
// /api/clients, /api/select-galleries처럼 고객 데이터·고객 전달과 관련된 API는
// 어떤 기능에도 포함하지 않는다 (고객 관리는 공유 대상에서 완전히 제외).
// /api/auth 같은 로그인 상태 확인용 인프라 API는 특정 기능 전용이 아니라 전역적으로
// 항상 열려 있어야 하므로 protectedApiPrefixes에 아예 넣지 않는다.
const FEATURE_API_SCOPE: Record<string, string[]> = {
  "/memo": ["/api/memo", "/api/calendar"],
  "/calendar": ["/api/calendar", "/api/memo"],
  "/quote": ["/api/quotes", "/api/ocr-pdf"],
  "/conti": ["/api/conti", "/api/conti-chat", "/api/conti-drawing", "/api/conti-images"],
  "/mailing": ["/api/mailing", "/api/contacts", "/api/select-galleries", "/api/send-delivery", "/api/send-brand-mail"],
  "/report": ["/api/report"],
  "/video-conti": ["/api/video-conti", "/api/brand-analysis"],
  "/daily-ideas": ["/api/daily-ideas"],
  "/sns-manager": ["/api/blog", "/api/naver-place", "/api/medical-ad-check"],
  "/review-studio": ["/api/reviews"],
  "/brand-analysis": ["/api/brand-analysis"],
  "/channel-analyzer": ["/api/channel-analysis"],
  "/diagnosis": ["/api/submit"],
  "/image-generator": ["/api/image-director"],
  "/website-builder": ["/api/website-design"],
  "/seo-delivery": ["/api/seo-delivery", "/api/workflow"],
  "/photo-sorting": ["/api/photo-scene-analyze", "/api/studio-face-analysis", "/api/studio-analysis", "/api/portrait-check"],
  "/video-sorting": ["/api/video-classify"],
  "/raw-select": ["/api/scene-naming"],
  "/select-match": ["/api/select-match"],
  "/photo-retouching": ["/api/color-sync", "/api/color-check"],
  "/prompter": ["/api/prompter-scripts", "/api/prompter-projects", "/api/prompter-proofread"],
};

// 위 기능 페이지들 + 공유 대상에서 제외된 페이지(고객 관리 등) — 공유 세션일 때
// 이 목록에 있는 경로로 이동하면 자신에게 허용된 feature_path 외에는 리다이렉트된다.
const SHARE_SCOPED_PAGE_PATHS = [
  "/",
  ...Object.keys(FEATURE_API_SCOPE),
  "/clients",
  "/portal-admin",
  "/link-generator",
];

// 토큰 → feature_path 조회 결과를 짧게 캐싱해 페이지 이동/연속 API 호출마다
// Supabase를 반복 호출하지 않도록 한다 (예: 영상분류에서 영상 84개를 순서대로 분석할 때).
const shareScopeCache = new Map<string, { featurePath: string | null; cachedAt: number }>();
const SHARE_SCOPE_CACHE_TTL_MS = 30_000;

async function resolveShareScope(token: string): Promise<string | null> {
  const cached = shareScopeCache.get(token);
  if (cached && Date.now() - cached.cachedAt < SHARE_SCOPE_CACHE_TTL_MS) {
    return cached.featurePath;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("share_links")
      .select("feature_path, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle();

    const expired = !!data?.expires_at && new Date(data.expires_at) < new Date();
    const featurePath = data && !data.revoked_at && !expired ? (data.feature_path as string) : null;
    shareScopeCache.set(token, { featurePath, cachedAt: Date.now() });
    return featurePath;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isAdminSession = req.cookies.get("pc_admin_session")?.value === "active";
  const shareToken = req.cookies.get("pc_share_token")?.value;

  // ── 팀 채팅 데이터 API — pc_admin_session이 아니라 팀원 개인 Supabase 세션이 있어야 한다 ──
  if (pathname.startsWith("/api/team-chat/rooms") || pathname.startsWith("/api/team-chat/members") || pathname.startsWith("/api/team/")) {
    if (await hasValidTeamChatMemberSession(req)) return NextResponse.next();
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }

  // ── API 보호 ──
  const shouldProtectApi = protectedApiPrefixes.some((prefix) => pathname.startsWith(prefix));
  if (shouldProtectApi) {
    const internalKey = req.headers.get("x-internal-key");
    if (internalKey && internalKey === process.env.INTERNAL_API_KEY) return NextResponse.next();
    if (isAdminSession) return NextResponse.next();

    if (shareToken) {
      const featurePath = await resolveShareScope(shareToken);
      const allowed = featurePath ? FEATURE_API_SCOPE[featurePath] ?? [] : [];
      if (allowed.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();
    }

    // internal-key를 들고 왔는데도 401이 나는 경우(길이만 비교, 값 자체는 로그에 남기지 않음) —
    // 서버 쪽 INTERNAL_API_KEY 미설정/공백/불일치 여부를 다음 발생 시 바로 확인하기 위한 임시 진단 로그.
    if (internalKey) {
      const envKey = process.env.INTERNAL_API_KEY;
      console.error(
        `[middleware] internal-key 인증 실패: path=${pathname} envKeySet=${Boolean(envKey)} envKeyLen=${envKey?.length ?? 0} headerKeyLen=${internalKey.length} match=${internalKey === envKey}`
      );
    }

    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  // 새 관리자 콘솔은 정식 관리자 세션에서만 접근한다.
  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !isAdminSession) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 팀 채팅 페이지 — 로그인 화면/초대 수락 화면은 세션 없이도 열려야 한다.
  // 그 외(/team-chat, /team-chat/rooms/...)는 관리자 세션 또는 팀원 개인 세션이 있어야 한다.
  // 관리자는 아직 채팅 멤버로 가입 전이어도 초대 발급/Drive 연결 패널은 볼 수 있게 admin 세션도 허용한다.
  const isTeamChatPublicPage = pathname.startsWith("/team-chat/login") || pathname.startsWith("/team-chat/invite");
  if (pathname.startsWith("/team-chat") && !isTeamChatPublicPage) {
    if (!isAdminSession && !(await hasValidTeamChatMemberSession(req))) {
      return NextResponse.redirect(new URL("/team-chat/login", req.url));
    }
  }
  if (pathname === "/team" || pathname.startsWith("/team/")) {
    if (!isAdminSession && !(await hasValidTeamChatMemberSession(req))) {
      return NextResponse.redirect(new URL("/team-chat/login", req.url));
    }
  }

  // ── 공유 세션의 페이지 이동 제한 (정식 관리자 세션이면 제한 없음) ──
  if (!isAdminSession && shareToken && SHARE_SCOPED_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const featurePath = await resolveShareScope(shareToken);
    if (!featurePath) {
      return NextResponse.redirect(new URL("/s/invalid", req.url));
    }
    if (pathname !== featurePath && !pathname.startsWith(featurePath + "/")) {
      return NextResponse.redirect(new URL(featurePath, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/admin", "/admin/:path*",
    "/",
    "/team-chat", "/team-chat/:path*",
    "/team", "/team/:path*",
    "/memo", "/memo/:path*",
    "/calendar", "/calendar/:path*",
    "/quote", "/quote/:path*",
    "/conti", "/conti/:path*",
    "/mailing", "/mailing/:path*",
    "/report", "/report/:path*",
    "/video-conti", "/video-conti/:path*",
    "/daily-ideas", "/daily-ideas/:path*",
    "/sns-manager", "/sns-manager/:path*",
    "/review-studio", "/review-studio/:path*",
    "/brand-analysis", "/brand-analysis/:path*",
    "/diagnosis", "/diagnosis/:path*",
    "/channel-analyzer", "/channel-analyzer/:path*",
    "/image-generator", "/image-generator/:path*",
    "/website-builder", "/website-builder/:path*",
    "/seo-delivery", "/seo-delivery/:path*",
    "/photo-sorting", "/photo-sorting/:path*",
    "/prompter", "/prompter/:path*",
    "/video-sorting", "/video-sorting/:path*",
    "/video-convert", "/video-convert/:path*",
    "/raw-select", "/raw-select/:path*",
    "/select-match", "/select-match/:path*",
    "/photo-retouching", "/photo-retouching/:path*",
    "/clients", "/clients/:path*",
    "/portal-admin", "/portal-admin/:path*",
    "/link-generator", "/link-generator/:path*",
  ],
};
