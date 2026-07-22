import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// 프롬프터 API 요청이 관리자 세션인지, 아니면 어떤 공유 링크(share_token) 세션인지 구분한다.
// /prompter는 middleware.ts의 FEATURE_API_SCOPE에 등록돼 있어 share_token만으로도
// 이 API들에 접근할 수 있으므로, 실제 데이터 스코프는 각 라우트에서 이 값으로 걸러야 한다.
export type PrompterScope = { isAdmin: boolean; shareToken: string | null };

// 토큰은 /s/[token]/route.ts에서 항상 영숫자로만 생성한다 — 값 자체는 클라이언트 쿠키라
// 사용자가 임의로 바꿔 보낼 수 있으니, 나중에 PostgREST .or() 필터 문자열에 그대로 끼워 넣기
// 전에 형식을 한 번 더 검증해서 필터 구문을 깨뜨리는 값이 섞여 들어가지 않게 한다.
const SAFE_TOKEN = /^[a-zA-Z0-9]+$/;

export function getPrompterScope(req: NextRequest): PrompterScope {
  const isAdmin = req.cookies.get("pc_admin_session")?.value === "active";
  const rawToken = req.cookies.get("pc_share_token")?.value ?? null;
  const shareToken = rawToken && SAFE_TOKEN.test(rawToken) ? rawToken : null;
  return { isAdmin, shareToken: isAdmin ? null : shareToken };
}

// 관리자는 share_token이 없는(=본인이 만든) 프로젝트만, 공유 세션은 자기 토큰과
// 정확히 일치하는 프로젝트(자기가 만든 것)이거나, 관리자가 그 토큰으로 통째로 공유해준
// 실제 프로젝트(public_share_token 일치)만 소유/접근 가능한 것으로 본다.
export async function assertProjectOwned(
  db: SupabaseClient,
  projectId: string,
  scope: PrompterScope
): Promise<boolean> {
  const { data } = await db
    .from("prompter_projects")
    .select("share_token, public_share_token")
    .eq("id", projectId)
    .maybeSingle();
  if (!data) return false;
  if (scope.isAdmin) return data.share_token === null;
  return data.share_token === scope.shareToken || (!!scope.shareToken && data.public_share_token === scope.shareToken);
}
