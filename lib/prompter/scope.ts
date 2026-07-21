import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// 프롬프터 API 요청이 관리자 세션인지, 아니면 어떤 공유 링크(share_token) 세션인지 구분한다.
// /prompter는 middleware.ts의 FEATURE_API_SCOPE에 등록돼 있어 share_token만으로도
// 이 API들에 접근할 수 있으므로, 실제 데이터 스코프는 각 라우트에서 이 값으로 걸러야 한다.
export type PrompterScope = { isAdmin: boolean; shareToken: string | null };

export function getPrompterScope(req: NextRequest): PrompterScope {
  const isAdmin = req.cookies.get("pc_admin_session")?.value === "active";
  const shareToken = req.cookies.get("pc_share_token")?.value ?? null;
  return { isAdmin, shareToken: isAdmin ? null : shareToken };
}

// 관리자는 share_token이 없는(=본인이 만든) 프로젝트만, 공유 세션은 자기 토큰과
// 정확히 일치하는 프로젝트만 소유한 것으로 본다 — 서로의 데이터는 절대 섞이지 않는다.
export async function assertProjectOwned(
  db: SupabaseClient,
  projectId: string,
  scope: PrompterScope
): Promise<boolean> {
  const { data } = await db
    .from("prompter_projects")
    .select("share_token")
    .eq("id", projectId)
    .maybeSingle();
  if (!data) return false;
  return scope.isAdmin ? data.share_token === null : data.share_token === scope.shareToken;
}
