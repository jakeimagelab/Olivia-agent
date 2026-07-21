import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 초대 발급은 관리자 전용 — pc_admin_session을 라우트 안에서 직접 확인한다
// (미들웨어의 팀챗 prefix 보호는 팀원 개인 세션만 확인하므로 이 라우트는 그 목록에서 뺐다).
export async function POST(req: NextRequest) {
  if (req.cookies.get("pc_admin_session")?.value !== "active") {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("team_invites").insert({ token, email });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const base = process.env.NEXTAUTH_URL || "https://olivia.photoclinic.kr";
  const url = `${base}/team-chat/invite/${token}`;
  return NextResponse.json({ ok: true, token, url });
}
