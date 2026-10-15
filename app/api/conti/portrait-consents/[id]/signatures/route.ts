import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/portraitConsent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ ok: false, error: "id가 올바르지 않습니다." }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const [consentResult, signaturesResult] = await Promise.all([
      db.from("portrait_consents").select("id, signature_limit").eq("id", id).maybeSingle(),
      db
        .from("portrait_consent_signatures")
        .select("id, portrait_consent_id, consent_shoot, consent_usage, provider_name, provider_phone, appearance_role, appearance_role_other, is_real_identity, consent_sensitive, signature_data_url, signed_date, signed_at, created_at")
        .eq("portrait_consent_id", id)
        .order("signed_at", { ascending: false }),
    ]);
    if (consentResult.error) throw new Error(consentResult.error.message);
    if (signaturesResult.error) throw new Error(signaturesResult.error.message);
    if (!consentResult.data) {
      return NextResponse.json({ ok: false, error: "동의서를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      signatures: signaturesResult.data ?? [],
      signatureCount: signaturesResult.data?.length ?? 0,
      signatureLimit: consentResult.data.signature_limit ?? 1,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "서명 목록 조회 실패" },
      { status: 500 },
    );
  }
}
