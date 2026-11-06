import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateCategoryPicks } from "@/lib/person-select/core";
import { parseSeoulDateTime } from "@/lib/person-select/date";
import { newPersonSelectProjectDefaults, normalizePersonSelectProjectSettings } from "@/lib/person-select/projectSettings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const db = getSupabaseAdmin();
  const { data: events, error } = await db.from("person_select_events").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const rows = await Promise.all((events ?? []).map(async (event) => {
    const [{ count: peopleCount }, { count: submittedCount }, { data: sharedSelection }] = await Promise.all([
      db.from("person_select_people").select("id", { count: "exact", head: true }).eq("event_id", event.id),
      db.from("person_select_people").select("id", { count: "exact", head: true }).eq("event_id", event.id).not("submitted_at", "is", null),
      db.from("person_select_shared_selections").select("id,submitted_at").eq("event_id", event.id).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
      ...event,
      people_count: peopleCount ?? 0,
      submitted_count: event.access_mode === "project_shared" ? (sharedSelection ? 1 : 0) : submittedCount ?? 0,
      shared_submitted_at: sharedSelection?.submitted_at ?? null,
    };
  }));
  return Response.json({ ok: true, events: rows });
}

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") : "";
  const deadlineAt = parseSeoulDateTime(body.deadline_at);
  if (!title || !slug || !deadlineAt) return Response.json({ ok: false, error: "프로젝트명, 공개 주소, 마감일을 입력해 주세요." }, { status: 400 });
  const { projectType, accessMode, customerViewMode } = normalizePersonSelectProjectSettings(body);
  const defaults = newPersonSelectProjectDefaults(projectType);
  const categories = Array.isArray(body.categories) ? body.categories : defaults.categories;
  const categoryProblem = validateCategoryPicks(categories);
  if (categoryProblem) return Response.json({ ok: false, error: categoryProblem }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("person_select_events").insert({
    title, slug, deadline_at: deadlineAt,
    client_id: typeof body.client_id === "string" && body.client_id ? body.client_id : null,
    project_type: projectType,
    access_mode: accessMode,
    customer_view_mode: customerViewMode,
    shared_token: accessMode === "project_shared" ? randomBytes(32).toString("hex") : null,
    shared_link_active: true,
    categories,
    retouch_options: Array.isArray(body.retouch_options) ? body.retouch_options : defaults.retouch_options,
    offer_notice: defaults.offer_notice,
    extra_price: defaults.extra_price,
    extra_max: defaults.extra_max,
    offers: defaults.offers,
    source_layout: accessMode === "project_shared" ? "project" : defaults.source_layout,
    memo_max: 300, status: "draft",
  }).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, event: data }, { status: 201 });
}
