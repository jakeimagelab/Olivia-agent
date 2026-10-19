import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { constantTimePinEqual, isLoginRateLimited, normalizeLoginName } from "@/lib/person-select/core";
import { createPersonSelectSession, PERSON_SELECT_COOKIE, PERSON_SELECT_SESSION_SECONDS } from "@/lib/person-select/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ipHash(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.PERSON_SELECT_SESSION_SECRET || process.env.INTERNAL_API_KEY || "person-select";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const db = getSupabaseAdmin();
  const hash = ipHash(request);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db.from("person_select_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("event_slug", eventSlug).eq("ip_hash", hash).eq("succeeded", false).gte("created_at", since);
  if (isLoginRateLimited(count ?? 0)) return NextResponse.json({ ok: false, error: "잠시 후 다시 시도해 주세요." }, { status: 429 });

  const body = await request.json().catch(() => ({})) as { name?: unknown; pin?: unknown };
  const name = typeof body.name === "string" ? normalizeLoginName(body.name) : "";
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const { data: event } = await db.from("person_select_events").select("id,status").eq("slug", eventSlug).maybeSingle();
  if (!event) return NextResponse.json({ ok: false, error: "행사를 찾을 수 없어요." }, { status: 404 });
  if (event.status === "draft") return NextResponse.json({ ok: false, error: "아직 열리지 않았어요." }, { status: 403 });

  const { data: matches } = await db.from("person_select_people")
    .select("id,event_id,pin_code")
    .eq("event_id", event.id).eq("login_name", name);
  const person = (matches ?? []).find((row) => constantTimePinEqual(String(row.pin_code ?? ""), pin));
  await db.from("person_select_login_attempts").insert({ event_slug: eventSlug, ip_hash: hash, succeeded: Boolean(person) });
  if (!person) return NextResponse.json({ ok: false, error: "이름 또는 비밀번호가 맞지 않아요." }, { status: 401 });

  const now = new Date().toISOString();
  await db.from("person_select_people").update({ first_seen_at: now, last_seen_at: now, updated_at: now }).eq("id", person.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PERSON_SELECT_COOKIE, createPersonSelectSession(person.id, event.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/pick/${eventSlug}`,
    maxAge: PERSON_SELECT_SESSION_SECONDS,
  });
  return response;
}
