import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { selectionStatus } from "@/lib/person-select/core";
import { signedImageUrl } from "@/lib/person-select/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params; const db = getSupabaseAdmin();
  const [{ data: event, error }, { data: people }, { data: choices }, { data: imageGroups }] = await Promise.all([
    db.from("person_select_events").select("*").eq("id", eventId).single(),
    db.from("person_select_people").select("id,event_id,display_name,login_name,group_label,first_seen_at,last_seen_at,submitted_at,updated_at").eq("event_id", eventId).order("display_name"),
    db.from("person_select_choices").select("id,event_id,person_id,category_key,image_id,retouch_keys,memo,updated_at,person_select_images(original_file_name,source_rel_path,thumb_path)").eq("event_id", eventId),
    db.from("person_select_images").select("owner_group,category_key").eq("event_id", eventId),
  ]);
  if (error || !event) return Response.json({ ok: false, error: error?.message || "행사를 찾을 수 없습니다." }, { status: 404 });
  const choiceRows = await Promise.all((choices ?? []).map(async (choice) => {
    const image = choice.person_select_images as unknown as { original_file_name: string; source_rel_path: string; thumb_path: string } | null;
    return { ...choice, person_select_images: image ? { ...image, thumb_url: await signedImageUrl(image.thumb_path) } : null };
  }));
  const peopleRows = (people ?? []).map((person) => {
    const ownChoices = choiceRows.filter((choice) => choice.person_id === person.id);
    const latest = ownChoices.map((choice) => choice.updated_at).sort().at(-1) ?? null;
    return { ...person, choices: ownChoices, status_label: selectionStatus({ firstSeenAt: person.first_seen_at, submittedAt: person.submitted_at, choiceCount: ownChoices.length, latestChoiceAt: latest }), latest_activity_at: latest || person.last_seen_at || person.first_seen_at };
  });
  const groups = Object.entries((imageGroups ?? []).reduce<Record<string, number>>((acc, row) => { if (row.category_key === "homeroom" && row.owner_group) acc[row.owner_group] = (acc[row.owner_group] ?? 0) + 1; return acc; }, {})).sort(([a], [b]) => a.localeCompare(b, "ko", { numeric: true })).map(([label, image_count]) => ({ label, image_count }));
  return Response.json({ ok: true, event, people: peopleRows, groups });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params; const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const allowed = ["title", "deadline_at", "status", "categories", "retouch_options", "memo_max"];
  const update = Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  if (update.status && !["draft", "open", "closed"].includes(String(update.status))) return Response.json({ ok: false, error: "올바르지 않은 행사 상태입니다." }, { status: 400 });
  update.updated_at = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin().from("person_select_events").update(update).eq("id", eventId).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, event: data });
}
