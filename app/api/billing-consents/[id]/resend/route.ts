import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendBillingConsentLinkEmail } from "@/lib/billing-consent/email";
import { billingConsentBaseUrl, billingConsentErrorResponse, loadBillingConsentById, recordBillingConsentEvent } from "@/lib/billing-consent/server";
import { generateBillingConsentToken, hashBillingConsentToken } from "@/lib/billing-consent/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    const db = getSupabaseAdmin();
    const consent = await loadBillingConsentById(id, db);
    if (!consent) return NextResponse.json({ ok: false, error: "청구 동의서를 찾지 못했습니다." }, { status: 404 });
    if (consent.status !== "sent" && consent.status !== "viewed") {
      return NextResponse.json({ ok: false, error: "확인 대기 중인 문서만 링크를 재발송할 수 있습니다." }, { status: 409 });
    }
    const email = String(consent.customer_snapshot?.email || "");
    if (!email) return NextResponse.json({ ok: false, error: "고객 이메일이 없습니다." }, { status: 400 });
    const token = generateBillingConsentToken();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000);
    const { error } = await db.from("billing_consents").update({
      token_hash: hashBillingConsentToken(token),
      expires_at: expiresAt.toISOString(),
      auth_cookie_version: consent.auth_cookie_version + 1,
    }).eq("id", id);
    if (error) throw new Error(error.message);
    const link = `${billingConsentBaseUrl(request)}/billing-consent/${token}`;
    await sendBillingConsentLinkEmail({
      to: email,
      customerName: String(consent.customer_snapshot?.name || "고객"),
      totalLabel: `${Number(consent.total).toLocaleString("ko-KR")}원`,
      link,
      expiresLabel: expiresAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }),
    });
    await recordBillingConsentEvent({ db, consentId: id, type: "resent", request, meta: { expiresAt: expiresAt.toISOString() } });
    await recordBillingConsentEvent({ db, consentId: id, type: "email_sent", request, meta: { kind: "link_resend" } });
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
