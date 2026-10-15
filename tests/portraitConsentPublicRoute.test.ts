import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const CONSENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN = "this-is-a-valid-portrait-consent-token";

let signatureCount = 1;
let signatureLimit = 2;
let rpcResult: Record<string, unknown>;
let rpcPayload: Record<string, unknown> | null;

const parentData = () => ({
  id: CONSENT_ID,
  title: "촬영 초상권 동의서",
  intro_text: "안내",
  detail_fields: [{ label: "촬영일", value: "2026-10-14" }],
  usage_items: [{ label: "SNS", value: "예" }],
  status: signatureCount >= signatureLimit ? "signed" : "sent",
  signature_limit: signatureLimit,
  token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  token_revoked_at: null,
  access_count: 3,
});

function fromTable(table: string) {
  if (table === "portrait_consent_signatures") {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null, count: signatureCount })),
      })),
    };
  }
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: parentData(), error: null })),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: fromTable,
    rpc: vi.fn(async (_name: string, payload: Record<string, unknown>) => {
      rpcPayload = payload;
      return { data: rpcResult, error: null };
    }),
  }),
}));

import { GET, POST } from "@/app/api/portrait-consent/[token]/route";

const params = { params: Promise.resolve({ token: TOKEN }) };

describe("portrait consent public multi-signer route", () => {
  beforeEach(() => {
    signatureCount = 1;
    signatureLimit = 2;
    rpcPayload = null;
    rpcResult = {
      ok: true,
      signature: {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        portrait_consent_id: CONSENT_ID,
        consent_shoot: true,
        consent_usage: true,
        provider_name: "두 번째 모델",
        provider_phone: "010-1234-5678",
        appearance_role: "patient_customer",
        appearance_role_other: null,
        is_real_identity: true,
        consent_sensitive: true,
        signature_data_url: "data:image/png;base64,signature",
        signed_date: "2026년 10월 14일",
        signed_at: "2026-10-14T12:00:00.000Z",
        created_at: "2026-10-14T12:00:00.000Z",
      },
      signatureCount: 2,
      signatureLimit: 2,
      complete: true,
    };
  });

  it("exposes progress but never another signer's personal data", async () => {
    const response = await GET(new NextRequest(`http://localhost/api/portrait-consent/${TOKEN}`), params);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.consent).toMatchObject({ signature_count: 1, signature_limit: 2, can_sign: true });
    expect(body.consent).not.toHaveProperty("provider_name");
    expect(body.consent).not.toHaveProperty("signature_data_url");
  });

  it("returns only the signature created by the current submitter", async () => {
    const request = new NextRequest(`http://localhost/api/portrait-consent/${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({
        consentShoot: true,
        consentUsage: true,
        providerName: "두 번째 모델",
        providerPhone: "010-1234-5678",
        appearanceRole: "patient_customer",
        appearanceRoleOther: null,
        isRealIdentity: true,
        consentSensitive: true,
        signatureDataUrl: "data:image/png;base64,signature",
      }),
    });
    const response = await POST(request, params);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      signature: {
        provider_name: "두 번째 모델",
        provider_phone: "010-1234-5678",
        appearance_role: "patient_customer",
        is_real_identity: true,
        consent_sensitive: true,
      },
      signatureCount: 2,
      signatureLimit: 2,
      complete: true,
    });
    expect(rpcPayload).toMatchObject({
      p_provider_name: "두 번째 모델",
      p_provider_phone: "010-1234-5678",
      p_appearance_role: "patient_customer",
      p_is_real_identity: true,
      p_consent_sensitive: true,
      p_signer_ip: "203.0.113.10",
    });
  });

  it("stores role performers with sensitive consent as not applicable", async () => {
    rpcResult = {
      ...rpcResult,
      signature: {
        ...(rpcResult.signature as Record<string, unknown>),
        appearance_role: "staff",
        is_real_identity: false,
        consent_sensitive: null,
      },
    };
    const request = new NextRequest(`http://localhost/api/portrait-consent/${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentShoot: true,
        consentUsage: true,
        providerName: "역할 모델",
        providerPhone: "010-2222-3333",
        appearanceRole: "staff",
        isRealIdentity: false,
        consentSensitive: true,
        signatureDataUrl: "data:image/png;base64,signature",
      }),
    });
    const response = await POST(request, params);
    expect(response.status).toBe(200);
    expect(rpcPayload).toMatchObject({
      p_is_real_identity: false,
      p_consent_sensitive: null,
    });
  });

  it("requires sensitive consent only for a real identity", async () => {
    const request = new NextRequest(`http://localhost/api/portrait-consent/${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentShoot: true,
        consentUsage: true,
        providerName: "실제 환자",
        providerPhone: "010-4444-5555",
        appearanceRole: "patient_customer",
        isRealIdentity: true,
        signatureDataUrl: "data:image/png;base64,signature",
      }),
    });
    const response = await POST(request, params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("민감정보 동의 여부를 선택해 주세요.");
    expect(rpcPayload).toBeNull();
  });

  it("reports a full link as a conflict without overwriting signatures", async () => {
    rpcResult = {
      ok: false,
      code: "complete",
      error: "필요한 서명이 모두 제출되었습니다.",
      signatureCount: 2,
      signatureLimit: 2,
    };
    const request = new NextRequest(`http://localhost/api/portrait-consent/${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentShoot: true,
        consentUsage: true,
        providerName: "세 번째 모델",
        providerPhone: "010-9999-0000",
        appearanceRole: "medical_staff",
        isRealIdentity: false,
        signatureDataUrl: "data:image/png;base64,signature",
      }),
    });
    const response = await POST(request, params);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("필요한 서명이 모두 제출되었습니다.");
  });
});
