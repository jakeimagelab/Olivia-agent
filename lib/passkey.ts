import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { WebAuthnCredential, Uint8Array_ } from "@simplewebauthn/server";

export const RP_NAME = "포토클리닉 AI 비서 관리자";
export const CANONICAL_PASSKEY_HOST = "olivia.photoclinic.kr";

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function isTrustedPasskeyHost(hostname: string) {
  if (hostname === CANONICAL_PASSKEY_HOST || hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.endsWith(".vercel.app")) return true;
  const configured = [process.env.NEXT_PUBLIC_BASE_URL, process.env.NEXT_PUBLIC_APP_URL]
    .flatMap((value) => {
      try { return value ? [new URL(value).hostname] : []; } catch { return []; }
    });
  return configured.includes(hostname);
}

/**
 * WebAuthn 패스키는 등록된 도메인(rpID)에서만 동작한다. rpID를 고정값으로 하드코딩하면
 * localhost/Vercel 프리뷰/프로덕션 도메인이 서로 달라 한쪽에서 등록한 패스키가 다른 쪽에서
 * 안 먹는 문제가 생기므로, 매 요청의 실제 origin에서 매번 계산한다.
 */
export function rpFromRequest(req: NextRequest): { rpID: string; origin: string } {
  let origin = req.headers.get("origin") || "";
  if (!origin) {
    const host = firstForwardedValue(req.headers.get("x-forwarded-host")) || req.headers.get("host") || "localhost:3000";
    const forwardedProto = firstForwardedValue(req.headers.get("x-forwarded-proto"));
    const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    origin = `${proto}://${host}`;
  }
  const parsed = new URL(origin);
  if (!isTrustedPasskeyHost(parsed.hostname)) throw new Error("허용되지 않은 패스키 접속 주소입니다.");
  const rpID = parsed.hostname;
  return { rpID, origin };
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function saveChallenge(db: SupabaseClient, challenge: string, type: "register" | "login") {
  const { error } = await db.from("admin_passkey_challenges").insert({ challenge, type });
  if (error) throw new Error(`패스키 인증 준비를 저장하지 못했습니다: ${error.message}`);
}

// challenge를 1회용으로 소비: 조회 즉시 삭제하고, 유효기간(5분) 지난 것들도 함께 청소한다.
export async function consumeChallenge(
  db: SupabaseClient,
  challenge: string,
  type: "register" | "login",
): Promise<boolean> {
  const cutoff = new Date(Date.now() - CHALLENGE_TTL_MS).toISOString();
  await db.from("admin_passkey_challenges").delete().lt("created_at", cutoff);

  const { data, error } = await db
    .from("admin_passkey_challenges")
    .select("id")
    .eq("challenge", challenge)
    .eq("type", type)
    .maybeSingle();
  if (error || !data) return false;

  await db.from("admin_passkey_challenges").delete().eq("id", data.id);
  return true;
}

export function encodePublicKey(publicKey: Uint8Array_): string {
  return isoBase64URL.fromBuffer(publicKey);
}

export function decodePublicKey(encoded: string): Uint8Array_ {
  return isoBase64URL.toBuffer(encoded);
}

export function rowToCredential(row: {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  rp_id?: string | null;
}): WebAuthnCredential {
  return {
    id: row.credential_id,
    publicKey: decodePublicKey(row.public_key),
    counter: row.counter,
    transports: (row.transports ?? []) as WebAuthnCredential["transports"],
  };
}

export function passkeyDomainMessage(rpID: string) {
  return `현재 주소(${rpID})에서 사용할 패스키가 없습니다. ${CANONICAL_PASSKEY_HOST}에서 비밀번호로 로그인한 뒤 패스키를 다시 등록해주세요.`;
}

export function isAdminSession(req: NextRequest): boolean {
  return req.cookies.get("pc_admin_session")?.value === "active";
}
