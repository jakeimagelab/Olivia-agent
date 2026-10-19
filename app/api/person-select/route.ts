import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_PERSON_SELECT_CATEGORIES, DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS } from "@/lib/person-select/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const db = getSupabaseAdmin();
  const { data: events, error } = await db.from("person_select_events").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const rows = await Promise.all((events ?? []).map(async (event) => {
    const [{ count: peopleCount }, { count: submittedCount }] = await Promise.all([
      db.from("person_select_people").select("id", { count: "exact", head: true }).eq("event_id", event.id),
      db.from("person_select_people").select("id", { count: "exact", head: true }).eq("event_id", event.id).not("submitted_at", "is", null),
    ]);
    return { ...event, people_count: peopleCount ?? 0, submitted_count: submittedCount ?? 0 };
  }));
  return Response.json({ ok: true, events: rows });
}

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") : "";
  const deadlineAt = typeof body.deadline_at === "string" ? body.deadline_at : "";
  if (!title || !slug || !deadlineAt) return Response.json({ ok: false, error: "행사명, 공개 주소, 마감일을 입력해 주세요." }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("person_select_events").insert({
    title, slug, deadline_at: deadlineAt,
    client_id: typeof body.client_id === "string" && body.client_id ? body.client_id : null,
    categories: Array.isArray(body.categories) ? body.categories : DEFAULT_PERSON_SELECT_CATEGORIES,
    retouch_options: Array.isArray(body.retouch_options) ? body.retouch_options : DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS,
    memo_max: 300, status: "draft",
  }).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, event: data }, { status: 201 });
}
