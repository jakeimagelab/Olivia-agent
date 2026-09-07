import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function makeToken(): string {
  return randomBytes(16).toString("hex");
}

// 같은 run + audience로 이미 발급된(취소 안 된) 토큰이 있으면 재사용한다 — 버튼을 여러 번
// 눌러도 링크가 계속 늘어나지 않는다.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const audience = body.audience === "staff" ? "staff" : "customer";

  const db = getSupabaseAdmin();

  const { data: existing, error: existingError } = await db
    .from("conti_run_shares")
    .select("token")
    .eq("run_id", id)
    .eq("audience", audience)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ ok: true, token: existing.token });

  const token = makeToken();
  const { error: insertError } = await db
    .from("conti_run_shares")
    .insert({ run_id: id, audience, token });
  if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, token });
}
