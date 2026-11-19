import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { calculateBillingConsentTotals, normalizeBillingConsentItems } from "@/lib/billing-consent/calculations";
import {
  billingConsentErrorResponse,
  cleanBillingConsentText,
  loadBillingConsentById,
  recordBillingConsentEvent,
} from "@/lib/billing-consent/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEvidence(input: unknown, existing: Array<Record<string, unknown>>) {
  if (!Array.isArray(input)) return existing;
  const normalized: Array<Record<string, unknown>> = [];
  for (const raw of input.slice(0, 20)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (item.kind === "image" && typeof item.storagePath === "string") {
      normalized.push({
        kind: "image",
        label: cleanBillingConsentText(item.label, 120) || "첨부 근거",
        storagePath: cleanBillingConsentText(item.storagePath, 500),
        mimeType: cleanBillingConsentText(item.mimeType, 80),
        size: Number(item.size) || 0,
      });
      continue;
    }
    if (item.kind === "clause") {
      const text = cleanBillingConsentText(item.text, 5_000);
      if (text) normalized.push({ kind: "clause", label: cleanBillingConsentText(item.label, 120) || "근거 조항", text });
    }
  }
  return normalized;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    const db = getSupabaseAdmin();
    const consent = await loadBillingConsentById(id, db);
    if (!consent) return NextResponse.json({ ok: false, error: "청구 동의서를 찾지 못했습니다." }, { status: 404 });
    const { data: events, error } = await db.from("billing_consent_events").select("id,type,at,ip,ua,meta").eq("consent_id", id).order("at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, consent, events: events ?? [] });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const db = getSupabaseAdmin();
    const consent = await loadBillingConsentById(id, db);
    if (!consent) return NextResponse.json({ ok: false, error: "청구 동의서를 찾지 못했습니다." }, { status: 404 });

    if (body.action === "cancel") {
      if (consent.status === "signed") return NextResponse.json({ ok: false, error: "서명 완료 문서는 취소할 수 없습니다." }, { status: 409 });
      if (consent.status === "canceled") return NextResponse.json({ ok: true, consent });
      const at = new Date().toISOString();
      const { data, error } = await db.from("billing_consents").update({ status: "canceled", canceled_at: at, auth_cookie_version: consent.auth_cookie_version + 1 }).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      await recordBillingConsentEvent({ db, consentId: id, type: "canceled", request });
      return NextResponse.json({ ok: true, consent: data });
    }

    if (body.action === "confirm_payment") {
      if (consent.status !== "signed") return NextResponse.json({ ok: false, error: "서명 완료 문서만 입금 확인할 수 있습니다." }, { status: 409 });
      const paymentConfirmedAt = consent.payment_confirmed_at || new Date().toISOString();
      const { data, error } = await db.from("billing_consents").update({ payment_confirmed_at: paymentConfirmedAt }).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      if (!consent.payment_confirmed_at) await recordBillingConsentEvent({ db, consentId: id, type: "payment_confirmed", request });
      return NextResponse.json({ ok: true, consent: data });
    }

    if (consent.status !== "draft") return NextResponse.json({ ok: false, error: "발송한 청구 내용은 수정할 수 없습니다. 새 버전을 만들어 주세요." }, { status: 409 });
    const totals = body.items === undefined
      ? { items: consent.items, subtotal: Number(consent.subtotal), vat: Number(consent.vat), total: Number(consent.total) }
      : calculateBillingConsentTotals(normalizeBillingConsentItems(body.items));
    const dueDate = body.dueDate === undefined ? consent.due_date : cleanBillingConsentText(body.dueDate, 10) || null;
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return NextResponse.json({ ok: false, error: "입금 기한이 올바르지 않습니다." }, { status: 400 });
    const { data, error } = await db.from("billing_consents").update({
      items: totals.items,
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      reason: body.reason === undefined ? consent.reason : cleanBillingConsentText(body.reason, 5_000),
      evidence: normalizeEvidence(body.evidence, consent.evidence),
      bank_info: body.bankInfo === undefined ? consent.bank_info : cleanBillingConsentText(body.bankInfo, 1_000),
      due_date: dueDate,
    }).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, consent: data });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
