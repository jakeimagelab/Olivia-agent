import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendBillingConsentLinkEmail } from "@/lib/billing-consent/email";
import {
  billingConsentBaseUrl,
  billingConsentErrorResponse,
  loadBillingConsentById,
  recordBillingConsentEvent,
} from "@/lib/billing-consent/server";
import { generateBillingConsentToken, hashBillingConsentToken } from "@/lib/billing-consent/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function days(value: unknown) {
  const number = Number(value ?? 14);
  return Number.isInteger(number) && number >= 1 && number <= 30 ? number : 14;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const db = getSupabaseAdmin();
    const consent = await loadBillingConsentById(id, db);
    if (!consent) return NextResponse.json({ ok: false, error: "청구 동의서를 찾지 못했습니다." }, { status: 404 });
    if (consent.status !== "draft") return NextResponse.json({ ok: false, error: "이미 발송한 문서입니다." }, { status: 409 });
    if (consent.verification_channel !== "email") return NextResponse.json({ ok: false, error: "SMS 공급자 설정 전에는 이메일 인증을 사용해 주세요." }, { status: 400 });
    const customer = consent.customer_snapshot ?? {};
    const email = typeof customer.email === "string" ? customer.email : "";
    if (!email) return NextResponse.json({ ok: false, error: "고객 이메일이 없습니다." }, { status: 400 });
    const token = generateBillingConsentToken();
    const sentAt = new Date();
    const expiresAt = new Date(sentAt.getTime() + days(body.expiresInDays) * 24 * 60 * 60 * 1_000);
    const { data: updated, error } = await db.from("billing_consents").update({
      status: "sent",
      token_hash: hashBillingConsentToken(token),
      sent_at: sentAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }).eq("id", id).eq("status", "draft").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return NextResponse.json({ ok: false, error: "다른 요청에서 먼저 발송했습니다." }, { status: 409 });
    await recordBillingConsentEvent({ db, consentId: id, type: "sent", request, meta: { expiresAt: expiresAt.toISOString() } });
    const link = `${billingConsentBaseUrl(request)}/billing-consent/${token}`;
    let warning: string | null = null;
    try {
      await sendBillingConsentLinkEmail({
        to: email,
        customerName: String(customer.name || "고객"),
        totalLabel: `${Number(consent.total).toLocaleString("ko-KR")}원`,
        link,
        expiresLabel: expiresAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }),
      });
      await recordBillingConsentEvent({ db, consentId: id, type: "email_sent", request, meta: { kind: "link" } });
    } catch (mailError) {
      warning = mailError instanceof Error ? mailError.message : "이메일을 발송하지 못했습니다.";
      await recordBillingConsentEvent({ db, consentId: id, type: "email_failed", request, meta: { kind: "link", reason: warning.slice(0, 300) } });
    }
    return NextResponse.json({
      ok: true,
      consent: updated,
      link,
      warning,
      message: `${customer.name || "고객"} 담당자님, 비용 청구 내용을 확인해 주세요.\n${link}\n링크는 ${expiresAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}까지 유효합니다.`,
    });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
