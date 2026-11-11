import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { collectStatusPanelData } from "@/lib/system-status/panelService";
import { collectSystemStatus } from "@/lib/system-status/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function collectLiveStatusPanel() {
  const db = getSupabaseAdmin();
  const now = new Date();
  // 스키마 전체 점검은 /api/system-status에서만 수행한다. 상단 상태 패널은 자주
  // 갱신되므로 운영 데이터와 Worker 상태만 읽고 결과를 짧게 공유 캐시한다.
  const diagnostics = await collectSystemStatus({ db, now, includeSchemaChecks: false });
  return collectStatusPanelData({ db, diagnostics, now });
}

const collectCachedStatusPanel = unstable_cache(
  collectLiveStatusPanel,
  ["olivia-os-status-panel-v3"],
  { revalidate: 30 },
);

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  let data;
  try {
    data = await collectCachedStatusPanel();
  } catch (error) {
    // Vitest나 로컬 단위 실행처럼 Next incremental cache가 없는 환경에서도
    // 같은 수집 로직을 검증할 수 있게 한다. 운영에서는 항상 공유 캐시를 사용한다.
    if (!(error instanceof Error) || !error.message.includes("incrementalCache missing")) throw error;
    data = await collectLiveStatusPanel();
  }
  return Response.json(data, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
  });
}
