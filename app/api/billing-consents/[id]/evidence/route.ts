import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  billingConsentErrorResponse,
  cleanBillingConsentText,
  loadBillingConsentById,
} from "@/lib/billing-consent/server";
import { uploadBillingConsentEvidence } from "@/lib/billing-consent/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    const db = getSupabaseAdmin();
    const consent = await loadBillingConsentById(id, db);
    if (!consent) return NextResponse.json({ ok: false, error: "청구 동의서를 찾지 못했습니다." }, { status: 404 });
    if (consent.status !== "draft") return NextResponse.json({ ok: false, error: "발송한 문서에는 근거를 추가할 수 없습니다." }, { status: 409 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "첨부할 이미지를 선택해 주세요." }, { status: 400 });
    const storagePath = await uploadBillingConsentEvidence({ consentId: id, file });
    const item = {
      kind: "image",
      label: cleanBillingConsentText(form.get("label"), 120) || file.name.slice(0, 120),
      storagePath,
      mimeType: file.type,
      size: file.size,
    };
    const evidence = [...(Array.isArray(consent.evidence) ? consent.evidence : []), item];
    const { error } = await db.from("billing_consents").update({ evidence }).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, evidence: item });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
