import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  calculateBillingConsentTotals,
  normalizeBillingConsentItems,
} from "@/lib/billing-consent/calculations";
import {
  billingConsentErrorResponse,
  cleanBillingConsentText,
  recordBillingConsentEvent,
} from "@/lib/billing-consent/server";
import {
  billingConsentSecret,
} from "@/lib/billing-consent/server";
import {
  generateBillingConsentDocumentId,
  hashBillingConsentTarget,
  maskBillingConsentTarget,
} from "@/lib/billing-consent/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value: unknown) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function normalizeEvidence(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 20).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    if (item.kind !== "clause") return [];
    const text = cleanBillingConsentText(item.text, 5_000);
    if (!text) return [];
    return [{ kind: "clause", label: cleanBillingConsentText(item.label, 120) || "근거 조항", text }];
  });
}

function normalizeDate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const text = cleanBillingConsentText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(new Date(`${text}T00:00:00Z`).getTime())) {
    throw new Error("입금 기한이 올바르지 않습니다.");
  }
  return text;
}

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const db = getSupabaseAdmin();
    const clientId = uuidOrNull(request.nextUrl.searchParams.get("clientId"));
    const workflowRunId = uuidOrNull(request.nextUrl.searchParams.get("workflowRunId"));
    const status = request.nextUrl.searchParams.get("status");
    let query = db
      .from("billing_consents")
      .select("id,document_id,customer_id,contract_id,quote_id,workflow_run_id,version,status,subtotal,vat,total,due_date,expires_at,sent_at,last_viewed_at,signed_at,disputed_at,canceled_at,payment_confirmed_at,created_at,customer_snapshot")
      .order("created_at", { ascending: false })
      .limit(200);
    if (clientId) query = query.eq("customer_id", clientId);
    if (workflowRunId) query = query.eq("workflow_run_id", workflowRunId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, consents: data ?? [] });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const customerId = uuidOrNull(body.customerId);
    if (!customerId) return NextResponse.json({ ok: false, error: "고객을 선택해 주세요." }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data: customer, error: customerError } = await db
      .from("clients")
      .select("id,hospital_name,contact_name,phone,email,address")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customer) return NextResponse.json({ ok: false, error: "고객을 찾지 못했습니다." }, { status: 404 });

    const contractId = uuidOrNull(body.contractId);
    const quoteId = uuidOrNull(body.quoteId);
    const workflowRunId = uuidOrNull(body.workflowRunId);
    const [contractResult, quoteResult] = await Promise.all([
      contractId
        ? db.from("contracts").select("id,client_id,workflow_run_id,quote_number,hospital_name,contact_name,email,quote_data,status,deposit_rate,payment_terms,delivery_terms,special_terms,created_at").eq("id", contractId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      quoteId
        ? db.from("quotes").select("id,client_id,workflow_run_id,quote_number,title,hospital_name,contact_name,phone,email,items,supply_amount,vat,total_amount,memos,created_at").eq("id", quoteId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (contractResult.error) throw new Error(contractResult.error.message);
    if (quoteResult.error) throw new Error(quoteResult.error.message);
    if (contractId && !contractResult.data) return NextResponse.json({ ok: false, error: "연결할 계약서를 찾지 못했습니다." }, { status: 404 });
    if (quoteId && !quoteResult.data) return NextResponse.json({ ok: false, error: "연결할 견적서를 찾지 못했습니다." }, { status: 404 });
    if (contractResult.data?.client_id && contractResult.data.client_id !== customerId) {
      return NextResponse.json({ ok: false, error: "선택한 고객의 계약서가 아닙니다." }, { status: 400 });
    }
    if (quoteResult.data?.client_id && quoteResult.data.client_id !== customerId) {
      return NextResponse.json({ ok: false, error: "선택한 고객의 견적서가 아닙니다." }, { status: 400 });
    }

    const totals = calculateBillingConsentTotals(normalizeBillingConsentItems(body.items));
    const verificationChannel = body.verificationChannel === "sms" ? "sms" : "email";
    const verificationTarget = cleanBillingConsentText(
      body.verificationTarget || (verificationChannel === "email" ? customer.email : customer.phone),
      320,
    );
    if (!verificationTarget) {
      return NextResponse.json({ ok: false, error: verificationChannel === "email" ? "고객 이메일을 입력해 주세요." : "고객 휴대폰 번호를 입력해 주세요." }, { status: 400 });
    }
    if (verificationChannel === "sms") {
      return NextResponse.json({ ok: false, error: "SMS 공급자 설정 전에는 이메일 인증을 사용해 주세요." }, { status: 400 });
    }
    const customerSnapshot = {
      name: customer.hospital_name || "고객",
      contactName: customer.contact_name || "",
      email: verificationTarget,
      phone: customer.phone || "",
      address: customer.address || "",
    };
    const issuerInput = body.issuer && typeof body.issuer === "object" && !Array.isArray(body.issuer)
      ? body.issuer as Record<string, unknown>
      : {};
    const issuerSnapshot = {
      companyName: cleanBillingConsentText(issuerInput.companyName, 120) || process.env.GMAIL_FROM_NAME || "포토클리닉",
      representative: cleanBillingConsentText(issuerInput.representative, 80),
      registrationNumber: cleanBillingConsentText(issuerInput.registrationNumber, 40),
      address: cleanBillingConsentText(issuerInput.address, 300),
      phone: cleanBillingConsentText(issuerInput.phone, 50),
      email: cleanBillingConsentText(issuerInput.email, 320) || process.env.GMAIL_USER || "",
    };
    const now = new Date().toISOString();
    const { data: consent, error: insertError } = await db.from("billing_consents").insert({
      document_id: generateBillingConsentDocumentId(),
      customer_id: customerId,
      contract_id: contractId,
      quote_id: quoteId,
      workflow_run_id: workflowRunId,
      customer_snapshot: customerSnapshot,
      issuer_snapshot: issuerSnapshot,
      contract_snapshot: contractResult.data || quoteResult.data
        ? { contract: contractResult.data ?? null, quote: quoteResult.data ?? null, capturedAt: now }
        : null,
      items: totals.items,
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      reason: cleanBillingConsentText(body.reason, 5_000),
      evidence: normalizeEvidence(body.evidence),
      bank_info: cleanBillingConsentText(body.bankInfo, 1_000),
      due_date: normalizeDate(body.dueDate),
      verification_channel: verificationChannel,
      verification_target_hash: hashBillingConsentTarget(verificationChannel, verificationTarget, billingConsentSecret()),
      verification_target_masked: maskBillingConsentTarget(verificationChannel, verificationTarget),
      status: "draft",
    }).select("*").single();
    if (insertError) throw new Error(insertError.message);
    await recordBillingConsentEvent({ db, consentId: consent.id, type: "created", request });
    return NextResponse.json({ ok: true, consent }, { status: 201 });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
