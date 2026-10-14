import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanText } from "@/lib/portraitConsent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashPortraitConsentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 의도적으로 /api/conti 접두사 밖에 둔다 — middleware.ts의 protectedApiPrefixes는 /api/conti를
// 관리자 세션 필수로 막는데, 이 라우트는 로그인하지 않은 초상권 제공자(모델/환자)가 링크만으로
// 열고 직접 서명해야 한다. 보안은 세션이 아니라 32바이트 랜덤 토큰 + 해시 저장 + 만료/취소로 확보한다.
const SELECT_COLUMNS =
  "id, title, intro_text, detail_fields, usage_items, status, signature_limit, token_expires_at, token_revoked_at, access_count";

async function loadByToken(token: string) {
  if (!token || token.length < 20 || token.length > 128) return { error: "유효하지 않은 링크입니다.", status: 404 as const };
  const tokenHash = hashPortraitConsentToken(token);
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("portrait_consents")
    .select(SELECT_COLUMNS)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { error: "유효하지 않은 링크입니다.", status: 404 as const };
  if (data.token_revoked_at) return { error: "취소된 링크입니다.", status: 410 as const };
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return { error: "만료된 링크입니다.", status: 410 as const };
  const { count, error: countError } = await db
    .from("portrait_consent_signatures")
    .select("id", { count: "exact", head: true })
    .eq("portrait_consent_id", data.id);
  if (countError) throw new Error(countError.message);
  return { data, db, tokenHash, signatureCount: count ?? 0 };
}

function requestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return cleanText(forwarded || req.headers.get("x-real-ip"), 100) || null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const result = await loadByToken(token);
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });

    const { data, db, signatureCount } = result;
    await db.from("portrait_consents").update({
      last_accessed_at: new Date().toISOString(),
      access_count: (data.access_count ?? 0) + 1,
    }).eq("id", data.id);

    const signatureLimit = data.signature_limit ?? 1;
    return NextResponse.json({
      ok: true,
      consent: {
        id: data.id,
        title: data.title,
        intro_text: data.intro_text,
        detail_fields: data.detail_fields,
        usage_items: data.usage_items,
        status: data.status,
        signature_count: signatureCount,
        signature_limit: signatureLimit,
        can_sign: signatureCount < signatureLimit,
      },
    });
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

    const { data, db, tokenHash } = result;

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

    const signedDate = new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Seoul",
    });
    const { data: submission, error } = await db.rpc("submit_portrait_consent_signature", {
      p_portrait_consent_id: data.id,
      p_token_hash: tokenHash,
      p_consent_shoot: consentShoot,
      p_consent_usage: consentUsage,
      p_provider_name: providerName,
      p_signature_data_url: signatureDataUrl,
      p_signed_date: signedDate,
      p_signer_ip: requestIp(req),
      p_user_agent: cleanText(req.headers.get("user-agent"), 500) || null,
    });
    if (error) throw new Error(error.message);

    const resultBody = submission as {
      ok?: boolean;
      code?: string;
      error?: string;
      signature?: Record<string, unknown>;
      signatureCount?: number;
      signatureLimit?: number;
      complete?: boolean;
    } | null;
    if (!resultBody?.ok) {
      const status = resultBody?.code === "complete" ? 409 : resultBody?.code === "expired" || resultBody?.code === "revoked" ? 410 : 400;
      return NextResponse.json(
        { ok: false, error: resultBody?.error || "서명을 제출하지 못했습니다." },
        { status },
      );
    }

    const signature = resultBody.signature ?? {};
    return NextResponse.json({
      ok: true,
      signature: {
        id: signature.id,
        portrait_consent_id: signature.portrait_consent_id,
        consent_shoot: signature.consent_shoot,
        consent_usage: signature.consent_usage,
        provider_name: signature.provider_name,
        signature_data_url: signature.signature_data_url,
        signed_date: signature.signed_date,
        signed_at: signature.signed_at,
        created_at: signature.created_at,
      },
      signatureCount: resultBody.signatureCount ?? 0,
      signatureLimit: resultBody.signatureLimit ?? data.signature_limit ?? 1,
      complete: resultBody.complete === true,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "제출 실패" }, { status: 500 });
  }
}
