import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope } from "@/lib/prompter/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 프로젝트를 실제 데이터 그대로 외부에 전체 공유한다 — 받는 사람은 이 프로젝트를 완전히
// 볼 수 있고 편집도 가능하다(전체 공유). 관리자만 만들 수 있다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = getPrompterScope(req);
  if (!scope.isAdmin) {
    return NextResponse.json({ ok: false, error: "관리자만 공유할 수 있습니다." }, { status: 403 });
  }

  const db = getSupabaseAdmin();
  const { data: project } = await db
    .from("prompter_projects")
    .select("id,name,share_token,public_share_token")
    .eq("id", id)
    .maybeSingle();
  if (!project || project.share_token !== null) {
    return NextResponse.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  // 이미 공유 중이면 기존 링크를 그대로 돌려준다 (중복 생성 방지).
  if (project.public_share_token) {
    const { data: existingLink } = await db
      .from("share_links")
      .select("token")
      .eq("token", project.public_share_token)
      .is("revoked_at", null)
      .maybeSingle();
    if (existingLink) return NextResponse.json({ ok: true, token: existingLink.token });
  }

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const { error: linkError } = await db.from("share_links").insert({
    token, feature_path: "/prompter", label: `프로젝트 공유: ${project.name}`,
  });
  if (linkError) return NextResponse.json({ ok: false, error: linkError.message }, { status: 500 });

  const { error: updateError } = await db.from("prompter_projects").update({ public_share_token: token }).eq("id", id);
  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, token });
}
