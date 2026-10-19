import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { PersonSelectSession } from "./types";

export const PERSON_SELECT_COOKIE = "pick_session";
export const PERSON_SELECT_SESSION_SECONDS = 7 * 24 * 60 * 60;

function key() {
  const value = process.env.PERSON_SELECT_SESSION_SECRET
    || process.env.TEMPORARY_DOCUMENT_SHARE_SECRET
    || process.env.INTERNAL_API_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("개인별 사진 셀렉 세션 서명 키가 없습니다.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function createPersonSelectSession(personId: string, eventId: string, nowMs = Date.now()) {
  const value: PersonSelectSession = {
    personId,
    eventId,
    expiresAt: nowMs + PERSON_SELECT_SESSION_SECONDS * 1000,
  };
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyPersonSelectSession(token: string | undefined | null): PersonSelectSession | null {
  if (!token) return null;
  const [payload, provided] = token.split(".");
  if (!payload || !provided) return null;
  const expected = signature(payload);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<PersonSelectSession>;
    if (!value.personId || !value.eventId || typeof value.expiresAt !== "number" || value.expiresAt <= Date.now()) return null;
    return value as PersonSelectSession;
  } catch {
    return null;
  }
}

export function sessionFromRequest(request: NextRequest) {
  return verifyPersonSelectSession(request.cookies.get(PERSON_SELECT_COOKIE)?.value);
}
