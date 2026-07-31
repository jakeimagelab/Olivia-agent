import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanText, hashPortraitConsentToken } from "@/lib/portraitConsent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 의도적으로 /api/conti 접두사 밖에 둔다 — middleware.ts의 protectedApiPrefixes는 /api/conti를
// 관리자 세션 필수로 막는데, 이 라우트는 로그인하지 않은 초상권 제공자(모델/환자)가 링크만으로
// 열고 직접 서명해야 한다. 보안은 세션이 아니라 32바이트 랜덤 토큰 + 해시 저장 + 만료/취소로 확보한다.
const SELECT_COLUMNS =
  "id, title, intro_text, detail_fields, usage_items, consent_shoot, consent_usage, provider_name, signature_data_url, signed_date, status, signed_at, token_expires_at, token_revoked_at";

async function loadByToken(token: string) {
  if (!token || token.length < 20 || token.length > 128) return { error: "유효하지 않은 링크입니다.", status: 404 as const };
  const tokenHash = hashPortraitConsentToken(token);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("portrait_consents").select(SELECT_COLUMNS).eq("token_hash", tokenHash).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { error: "유효하지 않은 링크입니다.", status: 404 as const };
  if (data.token_revoked_at) return { error: "취소된 링크입니다.", status: 410 as const };
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return { error: "만료된 링크입니다.", status: 410 as const };
  return { data, db, tokenHash };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const result = await loadByToken(token);
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });

    const { data, db } = result;
    if (data.status !== "signed") {
      await db.from("portrait_consents").update({
        last_accessed_at: new Date().toISOString(),
      }).eq("id", data.id).then(() => {});
    }

    return NextResponse.json({ ok: true, consent: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}

// POST — 초상권 제공자가 동의 여부(예/아니오)와 서명을 제출. 파일이 아닌 DB 저장이 원본이다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const result = await loadByToken(token);
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });

    const { data, db } = result;
    if (data.status === "signed") {
      return NextResponse.json({ ok: false, error: "이미 서명이 제출된 동의서입니다." }, { status: 400 });
    }

    const body = await req.json();
    const consentShoot = body.consentShoot === true || body.consentShoot === false ? body.consentShoot : null;
    const consentUsage = body.consentUsage === true || body.consentUsage === false ? body.consentUsage : null;
    const providerName = cleanText(body.providerName, 100);
    const signatureDataUrl = typeof body.signatureDataUrl === "string" ? body.signatureDataUrl : "";

    if (consentShoot === null || consentUsage === null) {
      return NextResponse.json({ ok: false, error: "동의 여부(예/아니오)를 모두 선택해 주세요." }, { status: 400 });
    }
    if (!providerName) {
      return NextResponse.json({ ok: false, error: "초상권 제공자 성명을 입력해 주세요." }, { status: 400 });
    }
    if (!signatureDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ ok: false, error: "서명을 입력해 주세요." }, { status: 400 });
    }
    if (signatureDataUrl.length > 500_000) {
      return NextResponse.json({ ok: false, error: "서명 데이터가 너무 큽니다." }, { status: 400 });
    }

    const signedDate = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    const { error } = await db
      .from("portrait_consents")
      .update({
        consent_shoot: consentShoot,
        consent_usage: consentUsage,
        provider_name: providerName,
        signature_data_url: signatureDataUrl,
        signed_date: signedDate,
        status: "signed",
        signed_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "제출 실패" }, { status: 500 });
  }
}
