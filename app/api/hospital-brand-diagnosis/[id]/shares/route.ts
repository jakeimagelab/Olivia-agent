import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { escapeText, isUuid } from "@/lib/hospitalBrandDiagnosis/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ACTIVE_SHARES = 10;
const DEFAULT_TTL_DAYS = 14;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

// GET — 공유 링크 관리 화면(만료/취소 여부, 마지막 접근 시각)에 쓸 목록.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("hospital_brand_diagnosis_shares")
      .select("id, recipient_email, recipient_memo, permission, expires_at, revoked_at, last_accessed_at, access_count, created_at")
      .eq("diagnosis_id", id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, shares: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "공유 링크 조회 실패" }, { status: 500 });
  }
}

// POST — 보기 전용 공유 링크 생성. 원본 토큰은 이 응답에서 한 번만 내려주고 DB에는 해시만 저장한다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });

    const body = await req.json();
    const recipientEmail = body.recipientEmail ? String(body.recipientEmail).trim() : "";
    if (recipientEmail && !isValidEmail(recipientEmail)) {
      return NextResponse.json({ ok: false, error: "받는 사람 이메일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const recipientMemo = escapeText(body.recipientMemo, 200);

    const supabase = getSupabaseAdmin();
    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("hospital_brand_diagnoses").select("id, report_json").eq("id", id).maybeSingle();
    if (diagnosisError) throw new Error(diagnosisError.message);
    if (!diagnosis) return NextResponse.json({ ok: false, error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });
    if (!diagnosis.report_json) return NextResponse.json({ ok: false, error: "완료된 리포트가 있어야 공유할 수 있습니다." }, { status: 400 });

    const { count, error: countError } = await supabase
      .from("hospital_brand_diagnosis_shares")
      .select("id", { count: "exact", head: true })
      .eq("diagnosis_id", id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= MAX_ACTIVE_SHARES) {
      return NextResponse.json({ ok: false, error: `공유 링크는 최대 ${MAX_ACTIVE_SHARES}개까지 유지할 수 있습니다. 기존 링크를 취소한 뒤 다시 시도해주세요.` }, { status: 400 });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_DAYS * 86400000).toISOString();

    const { data: share, error } = await supabase
      .from("hospital_brand_diagnosis_shares")
      .insert({
        diagnosis_id: id, token_hash: tokenHash, recipient_email: recipientEmail,
        recipient_memo: recipientMemo, permission: "view", expires_at: expiresAt,
      })
      .select("id, expires_at, created_at")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, share, token });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "공유 링크 생성 실패" }, { status: 500 });
  }
}
