import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { WebAuthnCredential } from "@simplewebauthn/server";

export const RP_NAME = "포토클리닉 AI 비서 관리자";

/**
 * WebAuthn 패스키는 등록된 도메인(rpID)에서만 동작한다. rpID를 고정값으로 하드코딩하면
 * localhost/Vercel 프리뷰/프로덕션 도메인이 서로 달라 한쪽에서 등록한 패스키가 다른 쪽에서
 * 안 먹는 문제가 생기므로, 매 요청의 실제 origin에서 매번 계산한다.
 */
export function rpFromRequest(req: Request): { rpID: string; origin: string } {
  let origin = req.headers.get("origin") || "";
  if (!origin) {
    const host = req.headers.get("host") || "localhost:3000";
    const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    origin = `${proto}://${host}`;
  }
  const rpID = new URL(origin).hostname;
  return { rpID, origin };
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function saveChallenge(db: SupabaseClient, challenge: string, type: "register" | "login") {
  await db.from("admin_passkey_challenges").insert({ challenge, type });
}

// challenge를 1회용으로 소비: 조회 즉시 삭제하고, 유효기간(5분) 지난 것들도 함께 청소한다.
export async function consumeChallenge(
  db: SupabaseClient,
  challenge: string,
  type: "register" | "login",
): Promise<boolean> {
  const cutoff = new Date(Date.now() - CHALLENGE_TTL_MS).toISOString();
  await db.from("admin_passkey_challenges").delete().lt("created_at", cutoff);

  const { data } = await db
    .from("admin_passkey_challenges")
    .select("id")
    .eq("challenge", challenge)
    .eq("type", type)
    .maybeSingle();
  if (!data) return false;

  await db.from("admin_passkey_challenges").delete().eq("id", data.id);
  return true;
}

export function encodePublicKey(publicKey: Uint8Array): string {
  return isoBase64URL.fromBuffer(publicKey);
}

export function decodePublicKey(encoded: string): Uint8Array {
  return isoBase64URL.toBuffer(encoded);
}

export function rowToCredential(row: {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
}): WebAuthnCredential {
  return {
    id: row.credential_id,
    publicKey: decodePublicKey(row.public_key),
    counter: row.counter,
    transports: (row.transports ?? []) as WebAuthnCredential["transports"],
  };
}

export function isAdminSession(req: Request): boolean {
  const cookie = req.headers.get("cookie") || "";
  return cookie.split(";").some((c) => c.trim() === "pc_admin_session=active");
}
